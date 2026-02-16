"use server";

import { revalidatePath } from "next/cache";

import { isSocialPublishingEnabledForBusiness } from "@/lib/features/social-publishing";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";
import {
  requireOwnerTenantWriteAccess,
  requireTenantAccess,
} from "@/lib/auth/guards";
import { generateSocialCaptionDraft } from "@/lib/services/social/caption-generator";
import { generateAndUploadPromoImage } from "@/lib/services/social/promo-image";
import { publishEvent, publishEvents } from "@/lib/services/outbox";
import { prisma } from "@/prisma/prisma";
import { DiscountType } from "@/prisma/generated/prisma/enums";
import {
  DEFAULT_SOCIAL_IMAGE_PROFILE,
  isSocialImageProfile,
  type SocialImageProfile,
} from "@/lib/services/social/image-profiles";

function normalizeHashtags(hashtags: string[]) {
  return Array.from(
    new Set(
      hashtags
        .map((hashtag) => hashtag.trim())
        .filter(Boolean)
        .map((hashtag) => (hashtag.startsWith("#") ? hashtag : `#${hashtag}`)),
    ),
  );
}

async function ensureSocialPublishingAccess(businessSlug: string) {
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.social) {
    return {
      success: false as const,
      error: "Social publishing is available on the Pro plan.",
    };
  }

  if (!isSocialPublishingEnabledForBusiness(businessSlug)) {
    return {
      success: false as const,
      error:
        "Social publishing is not enabled for this business yet. Contact support to join the pilot.",
    };
  }

  return null;
}

async function ensureAiAccess(businessSlug: string) {
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.ai) {
    return {
      success: false as const,
      error: "AI social generation is available on the Pro plan.",
    };
  }

  return null;
}

export async function getSocialConnectionsAction(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(businessSlug);
  if (featureError) return featureError;

  try {
    const connections = await prisma.socialConnection.findMany({
      where: { business: { slug: businessSlug } },
      orderBy: [{ platform: "asc" }],
    });

    return { success: true as const, data: connections };
  } catch (error) {
    console.error("Error fetching social connections:", error);
    return {
      success: false as const,
      error: "Failed to load social connections.",
    };
  }
}

export async function disconnectSocialConnectionAction(params: {
  businessSlug: string;
  connectionId: string;
}) {
  const auth = await requireOwnerTenantWriteAccess(params.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(params.businessSlug);
  if (featureError) return featureError;

  try {
    const result = await prisma.socialConnection.updateMany({
      where: {
        id: params.connectionId,
        business: { slug: params.businessSlug },
      },
      data: {
        status: "REVOKED",
      },
    });

    if (result.count === 0) {
      return { success: false as const, error: "Social connection not found." };
    }

    await prisma.auditLog.create({
      data: {
        entity_type: "SocialConnection",
        entity_id: params.connectionId,
        action: "DISCONNECTED",
        actor_id: auth.session.user.id,
        actor_type: "USER",
        business_id: auth.businessSlug,
      },
    });

    revalidatePath(`/app/${params.businessSlug}/business`);
    revalidatePath(`/app/${params.businessSlug}/sale-events`);
    revalidatePath(`/app/${params.businessSlug}/social-posts`);
    return { success: true as const };
  } catch (error) {
    console.error("Error disconnecting social connection:", error);
    return {
      success: false as const,
      error: "Failed to disconnect social connection.",
    };
  }
}

export async function generateSocialCaptionAction(input: {
  businessSlug: string;
  saleTitle: string;
  saleDescription?: string;
  discountType: DiscountType;
  discountValue: number;
  startDate: Date | string;
  endDate: Date | string;
  serviceNames?: string[];
  serviceCategories?: string[];
  packageNames?: string[];
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;
  const aiError = await ensureAiAccess(input.businessSlug);
  if (aiError) return aiError;

  try {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { success: false as const, error: "Invalid event date range." };
    }

    const business = await prisma.business.findUnique({
      where: { slug: input.businessSlug },
      select: { name: true, description: true },
    });

    if (!business) {
      return { success: false as const, error: "Business not found." };
    }

    const generated = await generateSocialCaptionDraft({
      businessSlug: input.businessSlug,
      businessName: business.name,
      businessDescription: business.description,
      saleTitle: input.saleTitle,
      saleDescription: input.saleDescription,
      discountType: input.discountType,
      discountValue: input.discountValue,
      startDate,
      endDate,
      serviceNames: input.serviceNames ?? [],
      serviceCategories: input.serviceCategories ?? [],
      packageNames: input.packageNames ?? [],
    });

    return {
      success: true as const,
      data: generated,
    };
  } catch (error) {
    console.error("Error generating social caption:", error);
    return {
      success: false as const,
      error: "Unable to generate social caption.",
    };
  }
}

export async function updateSocialPostDraftAction(input: {
  businessSlug: string;
  postId: string;
  title: string;
  captionFinal: string;
  hashtags: string[];
  mediaUrl?: string | null;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;

  try {
    const post = await prisma.socialPost.findFirst({
      where: {
        id: input.postId,
        business: { slug: input.businessSlug },
      },
      select: { id: true },
    });

    if (!post) {
      return { success: false as const, error: "Social post draft not found." };
    }

    const captionFinal = input.captionFinal.trim();
    const status = captionFinal ? "READY" : "DRAFT";
    const hashtags = normalizeHashtags(input.hashtags);

    await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        title: input.title.trim(),
        caption_final: captionFinal || null,
        hashtags,
        media_url: input.mediaUrl?.trim() || null,
        status,
        last_error: null,
      },
    });

    revalidatePath(`/app/${input.businessSlug}/social-posts`);
    revalidatePath(`/app/${input.businessSlug}/sale-events`);
    return { success: true as const };
  } catch (error) {
    console.error("Error updating social post draft:", error);
    return { success: false as const, error: "Failed to update social draft." };
  }
}

export async function deleteSocialPostDraftAction(input: {
  businessSlug: string;
  postId: string;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;

  try {
    const post = await prisma.socialPost.findFirst({
      where: {
        id: input.postId,
        business: { slug: input.businessSlug },
      },
      select: {
        id: true,
        title: true,
        status: true,
        business_id: true,
      },
    });

    if (!post) {
      return { success: false as const, error: "Social post draft not found." };
    }

    if (post.status !== "DRAFT") {
      return {
        success: false as const,
        error: "Only saved draft posts can be deleted.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.socialPost.delete({
        where: { id: post.id },
      });

      await tx.auditLog.create({
        data: {
          entity_type: "SocialPost",
          entity_id: post.id,
          action: "DRAFT_DELETED",
          actor_id: auth.session.user.id,
          actor_type: "USER",
          business_id: post.business_id,
          changes: {
            title: post.title,
            status: post.status,
          },
        },
      });
    });

    revalidatePath(`/app/${input.businessSlug}/social-posts`);
    revalidatePath(`/app/${input.businessSlug}/sale-events`);
    return { success: true as const };
  } catch (error) {
    console.error("Error deleting social post draft:", error);
    return { success: false as const, error: "Failed to delete social draft." };
  }
}

export async function generateSocialPostImageAction(input: {
  businessSlug: string;
  postId: string;
  imageProfile?: SocialImageProfile;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;
  const aiError = await ensureAiAccess(input.businessSlug);
  if (aiError) return aiError;

  try {
    const post = await prisma.socialPost.findFirst({
      where: {
        id: input.postId,
        business: { slug: input.businessSlug },
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        sale_event: {
          select: {
            title: true,
            description: true,
            discount_type: true,
            discount_value: true,
            start_date: true,
            end_date: true,
            applicable_services: { select: { name: true, category: true } },
            applicable_packages: { select: { name: true } },
          },
        },
      },
    });

    if (!post) {
      return { success: false as const, error: "Social post draft not found." };
    }

    if (!post.sale_event) {
      return {
        success: false as const,
        error:
          "Auto image generation is currently available for sale-event social drafts only.",
      };
    }

    const imageProfile = input.imageProfile || DEFAULT_SOCIAL_IMAGE_PROFILE;
    if (!isSocialImageProfile(imageProfile)) {
      return { success: false as const, error: "Invalid image profile selected." };
    }

    const mediaUrl = await generateAndUploadPromoImage({
      businessSlug: post.business.slug,
      businessName: post.business.name,
      title: post.sale_event.title,
      saleDescription: post.sale_event.description,
      captionText: post.caption_final || post.caption_draft,
      discountType: post.sale_event.discount_type,
      discountValue: post.sale_event.discount_value,
      startDate: post.sale_event.start_date,
      endDate: post.sale_event.end_date,
      serviceNames: post.sale_event.applicable_services.map(
        (service) => service.name,
      ),
      serviceCategories: Array.from(
        new Set(post.sale_event.applicable_services.map((service) => service.category)),
      ),
      packageNames: post.sale_event.applicable_packages.map(
        (pkg) => pkg.name,
      ),
      imageProfile,
    });

    if (!mediaUrl) {
      return {
        success: false as const,
        error:
          "Image generation is unavailable right now. Configure BLOB_READ_WRITE_TOKEN and GEMINI_KEY, then try again.",
      };
    }

    await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        media_url: mediaUrl,
        last_error: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        entity_type: "SocialPost",
        entity_id: post.id,
        action: "IMAGE_GENERATED",
        actor_id: auth.session.user.id,
        actor_type: "USER",
        business_id: post.business.id,
        changes: {
          mediaUrl,
          imageProfile,
        },
      },
    });

    revalidatePath(`/app/${input.businessSlug}/social-posts`);
    revalidatePath(`/app/${input.businessSlug}/sale-events`);
    return { success: true as const, data: { mediaUrl } };
  } catch (error) {
    console.error("Error generating social post image:", error);
    return {
      success: false as const,
      error: "Failed to generate social image.",
    };
  }
}

export async function regenerateSocialPostCaptionAction(input: {
  businessSlug: string;
  postId: string;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;
  const aiError = await ensureAiAccess(input.businessSlug);
  if (aiError) return aiError;

  try {
    const post = await prisma.socialPost.findFirst({
      where: {
        id: input.postId,
        business: { slug: input.businessSlug },
      },
      include: {
        business: {
          select: {
            name: true,
            slug: true,
            description: true,
          },
        },
        sale_event: {
          select: {
            title: true,
            description: true,
            discount_type: true,
            discount_value: true,
            start_date: true,
            end_date: true,
            applicable_services: { select: { name: true, category: true } },
            applicable_packages: { select: { name: true } },
          },
        },
      },
    });

    if (!post) {
      return { success: false as const, error: "Social post draft not found." };
    }

    if (!post.sale_event) {
      return {
        success: false as const,
        error: "Caption regeneration is currently available for sale-event drafts only.",
      };
    }

    const generated = await generateSocialCaptionDraft({
      businessSlug: post.business.slug,
      businessName: post.business.name,
      businessDescription: post.business.description,
      saleTitle: post.sale_event.title,
      saleDescription: post.sale_event.description,
      discountType: post.sale_event.discount_type,
      discountValue: post.sale_event.discount_value,
      startDate: post.sale_event.start_date,
      endDate: post.sale_event.end_date,
      serviceNames: post.sale_event.applicable_services.map(
        (service) => service.name,
      ),
      serviceCategories: Array.from(
        new Set(post.sale_event.applicable_services.map((service) => service.category)),
      ),
      packageNames: post.sale_event.applicable_packages.map(
        (pkg) => pkg.name,
      ),
    });

    return {
      success: true as const,
      data: generated,
    };
  } catch (error) {
    console.error("Error regenerating social caption:", error);
    return {
      success: false as const,
      error: "Unable to regenerate social caption.",
    };
  }
}

export async function publishSocialPostAction(input: {
  businessSlug: string;
  postId: string;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;

  try {
    await prisma.$transaction(async (tx) => {
      const post = await tx.socialPost.findFirst({
        where: {
          id: input.postId,
          business: { slug: input.businessSlug },
        },
        include: {
          business: { select: { id: true } },
          targets: {
            include: {
              social_connection: {
                select: { platform: true },
              },
            },
          },
        },
      });

      if (!post) {
        throw new Error("Social post not found.");
      }

      if (post.status === "PUBLISHED") {
        return;
      }

      if (post.status === "PUBLISHING") {
        throw new Error("This post is already being published.");
      }

      if (post.targets.length === 0) {
        throw new Error(
          "No connected channels on this draft. Connect Facebook/Instagram or choose channels first.",
        );
      }

      const targetsToQueue = post.targets.filter(
        (target) => target.status !== "PUBLISHED",
      );
      if (targetsToQueue.length === 0) {
        throw new Error("All channels for this post are already published.");
      }

      const hasInstagramTarget = targetsToQueue.some(
        (target) =>
          target.social_connection.platform === "INSTAGRAM_BUSINESS",
      );
      if (hasInstagramTarget && !post.media_url) {
        throw new Error(
          "Instagram publishing requires media. Add a media URL before publishing.",
        );
      }

      await tx.socialPost.update({
        where: { id: post.id },
        data: {
          status: "PUBLISHING",
          publish_requested_at: new Date(),
          last_error: null,
        },
      });

      await tx.socialPostTarget.updateMany({
        where: {
          social_post_id: post.id,
          id: { in: targetsToQueue.map((target) => target.id) },
        },
        data: {
          status: "QUEUED",
          last_error: null,
        },
      });

      await publishEvents(
        tx,
        targetsToQueue.map((target) => ({
          type: "SOCIAL_TARGET_PUBLISH" as const,
          aggregateType: "SocialPost",
          aggregateId: post.id,
          businessId: post.business_id,
          payload: {
            socialPostTargetId: target.id,
            businessId: post.business_id,
          },
        })),
      );

      await tx.auditLog.create({
        data: {
          entity_type: "SocialPost",
          entity_id: post.id,
          action: "PUBLISH_REQUESTED",
          actor_id: auth.session.user.id,
          actor_type: "USER",
          business_id: post.business_id,
          changes: {
            targetsQueued: targetsToQueue.length,
          },
        },
      });
    });

    revalidatePath(`/app/${input.businessSlug}/social-posts`);
    revalidatePath(`/app/${input.businessSlug}/sale-events`);
    return { success: true as const };
  } catch (error) {
    console.error("Error publishing social post:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to publish post.",
    };
  }
}

export async function retrySocialPostTargetAction(input: {
  businessSlug: string;
  targetId: string;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;

  try {
    await prisma.$transaction(async (tx) => {
      const target = await tx.socialPostTarget.findFirst({
        where: {
          id: input.targetId,
          social_post: {
            business: { slug: input.businessSlug },
          },
        },
        include: {
          social_post: true,
        },
      });

      if (!target) {
        throw new Error("Target channel not found.");
      }

      if (target.status === "PUBLISHED") {
        return;
      }

      await tx.socialPost.update({
        where: { id: target.social_post_id },
        data: {
          status: "PUBLISHING",
          publish_requested_at: new Date(),
          last_error: null,
        },
      });

      await tx.socialPostTarget.update({
        where: { id: target.id },
        data: {
          status: "QUEUED",
          last_error: null,
        },
      });

      await publishEvent(tx, {
        type: "SOCIAL_TARGET_PUBLISH",
        aggregateType: "SocialPost",
        aggregateId: target.social_post_id,
        businessId: target.social_post.business_id,
        payload: {
          socialPostTargetId: target.id,
          businessId: target.social_post.business_id,
        },
      });

      await tx.auditLog.create({
        data: {
          entity_type: "SocialPostTarget",
          entity_id: target.id,
          action: "RETRY_REQUESTED",
          actor_id: auth.session.user.id,
          actor_type: "USER",
          business_id: target.social_post.business_id,
        },
      });
    });

    revalidatePath(`/app/${input.businessSlug}/social-posts`);
    return { success: true as const };
  } catch (error) {
    console.error("Error retrying social post target:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to retry target.",
    };
  }
}
