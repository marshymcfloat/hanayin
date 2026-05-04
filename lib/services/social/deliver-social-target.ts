import { logger } from "@/lib/logger";
import { prisma } from "@/prisma/prisma";
import {
  publishToFacebookPage,
  publishToInstagramBusiness,
} from "@/lib/services/social/meta-client";
import { decryptToken } from "@/lib/services/social/token-crypto";

export class SocialNonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialNonRetryableError";
  }
}

function isTokenError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("access token") ||
    normalized.includes("oauth") ||
    normalized.includes("session has expired")
  );
}

async function recomputePostStatus(postId: string) {
  const targets = await prisma.socialPostTarget.findMany({
    where: { social_post_id: postId },
    select: { status: true, last_error: true },
  });

  const hasPublishing = targets.some(
    (target) => target.status === "QUEUED" || target.status === "PUBLISHING",
  );
  const allPublished =
    targets.length > 0 &&
    targets.every((target) => target.status === "PUBLISHED");
  const hasFailed = targets.some((target) => target.status === "FAILED");

  if (allPublished) {
    // Wave E E11: when the SocialPost crosses into PUBLISHED, fire the
    // close-the-loop notification IF this post originated from a
    // SocialPostRequest (the staff member who requested it deserves
    // to know it went live, plus a permalink to share). The status
    // update + outbox row go in one transaction so the notification is
    // atomic with the publish.
    const targetsWithLinks = await prisma.socialPostTarget.findMany({
      where: { social_post_id: postId, status: "PUBLISHED" },
      select: { remote_permalink: true },
    });
    const permalinks = targetsWithLinks
      .map((t) => t.remote_permalink)
      .filter((url): url is string => typeof url === "string" && url.length > 0);

    await prisma.$transaction(async (tx) => {
      const updated = await tx.socialPost.update({
        where: { id: postId },
        data: {
          status: "PUBLISHED",
          published_at: new Date(),
          last_error: null,
        },
        select: {
          id: true,
          business_id: true,
          title: true,
          source_request: {
            select: {
              id: true,
              requested_by_user_id: true,
              topic: true,
            },
          },
        },
      });

      if (updated.source_request) {
        await tx.outboxMessage.create({
          data: {
            event_type: "SOCIAL_POST_REQUEST_PUBLISHED",
            aggregate_type: "SocialPostRequest",
            aggregate_id: updated.source_request.id,
            business_id: updated.business_id,
            payload: {
              requestId: updated.source_request.id,
              businessId: updated.business_id,
              requestedByUserId: updated.source_request.requested_by_user_id,
              socialPostId: updated.id,
              topic: updated.source_request.topic,
              permalinks,
            },
          },
        });
      }
    });
    return;
  }

  if (hasPublishing) {
    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        status: "PUBLISHING",
      },
    });
    return;
  }

  if (hasFailed) {
    const firstError = targets.find((target) => target.last_error)?.last_error;
    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        status: "FAILED",
        last_error: firstError || "One or more channels failed to publish",
      },
    });
    return;
  }

  await prisma.socialPost.update({
    where: { id: postId },
    data: {
      status: "READY",
      last_error: null,
    },
  });
}

export async function deliverSocialTargetPublish(input: {
  socialPostTargetId: string;
  businessId: string;
  outboxMessageId?: string;
}) {
  const target = await prisma.socialPostTarget.findUnique({
    where: { id: input.socialPostTargetId },
    include: {
      social_connection: true,
      social_post: true,
    },
  });

  if (!target) {
    throw new SocialNonRetryableError(
      `Social post target ${input.socialPostTargetId} was not found`,
    );
  }

  if (target.social_post.business_id !== input.businessId) {
    throw new SocialNonRetryableError(
      "Social post target does not belong to the expected business",
    );
  }

  if (target.status === "PUBLISHED") {
    logger.info("[Social] Target already published. Skipping duplicate delivery.", {
      socialPostTargetId: target.id,
      socialPostId: target.social_post_id,
      outboxMessageId: input.outboxMessageId,
    });
    return;
  }

  if (target.social_connection.status !== "CONNECTED") {
    throw new SocialNonRetryableError(
      `${target.social_connection.platform} is not connected`,
    );
  }

  const caption =
    target.social_post.caption_final?.trim() ||
    target.social_post.caption_draft?.trim();

  if (!caption) {
    throw new SocialNonRetryableError("Social post caption is empty");
  }

  const accessToken = decryptToken(target.social_connection.access_token_encrypted);
  const mediaUrl = target.social_post.media_url;

  await prisma.socialPostTarget.update({
    where: { id: target.id },
    data: {
      status: "PUBLISHING",
      last_error: null,
    },
  });

  try {
    let publishResult: { remotePostId: string | null; permalink: string | null };

    if (target.social_connection.platform === "FACEBOOK_PAGE") {
      publishResult = await publishToFacebookPage({
        pageId: target.social_connection.external_account_id,
        accessToken,
        caption,
        mediaUrl,
      });
    } else {
      if (!mediaUrl) {
        throw new SocialNonRetryableError(
          "Instagram publishing requires a media URL",
        );
      }

      publishResult = await publishToInstagramBusiness({
        instagramBusinessId: target.social_connection.external_account_id,
        accessToken,
        caption,
        mediaUrl,
      });
    }

    await prisma.socialPostTarget.update({
      where: { id: target.id },
      data: {
        status: "PUBLISHED",
        last_error: null,
        remote_post_id: publishResult.remotePostId,
        remote_permalink: publishResult.permalink,
        published_at: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        entity_type: "SocialPostTarget",
        entity_id: target.id,
        action: "PUBLISHED",
        actor_type: "SYSTEM",
        business_id: input.businessId,
        changes: {
          socialPostId: target.social_post_id,
          platform: target.social_connection.platform,
          remotePostId: publishResult.remotePostId,
          remotePermalink: publishResult.permalink,
        },
      },
    });

    await recomputePostStatus(target.social_post_id);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isNonRetryable = error instanceof SocialNonRetryableError;

    await prisma.socialPostTarget.update({
      where: { id: target.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        last_error: errorMessage,
      },
    });

    if (isTokenError(errorMessage)) {
      await prisma.socialConnection.update({
        where: { id: target.social_connection_id },
        data: { status: "EXPIRED" },
      });
    }

    await recomputePostStatus(target.social_post_id);

    logger.error("[Social] Target publish failed", {
      socialPostTargetId: target.id,
      socialPostId: target.social_post_id,
      platform: target.social_connection.platform,
      outboxMessageId: input.outboxMessageId,
      nonRetryable: isNonRetryable,
      errorMessage,
    });

    if (isNonRetryable) {
      throw error;
    }

    throw new Error(errorMessage);
  }
}
