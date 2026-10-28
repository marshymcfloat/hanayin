import "server-only";

import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { parseCampaignCreativeContext } from "@/lib/services/growth/creative-context";
import { prisma } from "@/prisma/prisma";
import type {
  OwnerSocialPostPreviewPost,
  OwnerSocialPostsPreviewData,
} from "@/features/social/types/owner-social-post-preview";

export type OwnerSocialPostPreviewQueryRow = {
  id: string;
  title: string;
  status: OwnerSocialPostPreviewPost["status"];
  caption_draft: string;
  caption_final: string | null;
  hashtags: string[];
  media_url: string | null;
  last_error: string | null;
  created_at: Date;
  published_at: Date | null;
  sale_event: {
    title: string;
    description: string | null;
    discount_type: NonNullable<OwnerSocialPostPreviewPost["saleEvent"]>["discountType"];
    discount_value: number;
    start_date: Date;
    end_date: Date;
  } | null;
  growth_campaigns: Array<{ opportunity_snapshot: unknown }>;
  targets: Array<{
    id: string;
    status: OwnerSocialPostPreviewPost["targets"][number]["status"];
    last_error: string | null;
    published_at: Date | null;
    remote_permalink: string | null;
    social_connection: {
      platform: OwnerSocialPostPreviewPost["targets"][number]["connection"]["platform"];
      display_name: string;
      status: OwnerSocialPostPreviewPost["targets"][number]["connection"]["status"];
    };
  }>;
};

type OwnerSocialPreviewConnectionRow = {
  id: string;
  platform: OwnerSocialPostsPreviewData["connections"][number]["platform"];
  display_name: string;
  status: OwnerSocialPostsPreviewData["connections"][number]["status"];
};

type OwnerSocialPreviewAssetRow = {
  id: string;
  url: string;
  alt: string | null;
  reference_subject: string | null;
};

export type OwnerSocialPostsPreviewResult =
  | { success: true; data: OwnerSocialPostsPreviewData }
  | {
      success: false;
      reason: "FORBIDDEN" | "NOT_FOUND" | "LOAD_FAILED";
      error: string;
    };

export type OwnerSocialPostDeliveryPreview = {
  generatedAt: string;
  posts: Array<Pick<OwnerSocialPostPreviewPost, "id" | "status" | "lastError" | "publishedAt"> & {
    targets: Array<Pick<OwnerSocialPostPreviewPost["targets"][number], "id" | "status" | "lastError" | "publishedAt" | "remotePermalink">>;
  }>;
};

export async function resolveOwnerSocialPostDeliveryPreview(
  businessSlug: string,
  userId: string,
): Promise<{ success: true; data: OwnerSocialPostDeliveryPreview } | { success: false; reason: "FORBIDDEN" | "LOAD_FAILED"; error: string }> {
  const actor = await resolveTenantActorContext(businessSlug, userId);
  if (!actor.success || actor.actorType !== "OWNER") {
    return { success: false, reason: "FORBIDDEN", error: "You do not have access to this owner preview." };
  }
  try {
    const rows = await prisma.socialPost.findMany({
      where: { business_id: actor.businessId },
      select: {
        id: true,
        status: true,
        last_error: true,
        published_at: true,
        targets: {
          select: {
            id: true,
            status: true,
            last_error: true,
            published_at: true,
            remote_permalink: true,
          },
        },
      },
    });
    return {
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        posts: rows.map((post) => ({
          id: post.id,
          status: post.status,
          lastError: post.last_error,
          publishedAt: post.published_at?.toISOString() ?? null,
          targets: post.targets.map((target) => ({
            id: target.id,
            status: target.status,
            lastError: target.last_error,
            publishedAt: target.published_at?.toISOString() ?? null,
            remotePermalink: target.remote_permalink,
          })),
        })),
      },
    };
  } catch {
    return { success: false, reason: "LOAD_FAILED", error: "Delivery statuses are temporarily unavailable." };
  }
}

export function toOwnerSocialPostPreviewDto(
  row: OwnerSocialPostPreviewQueryRow,
): OwnerSocialPostPreviewPost {
  const growth = parseCampaignCreativeContext(
    row.growth_campaigns[0]?.opportunity_snapshot,
  );

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    caption: row.caption_final?.trim() || row.caption_draft,
    hashtags: [...row.hashtags],
    mediaUrl: row.media_url,
    lastError: row.last_error,
    createdAt: row.created_at.toISOString(),
    publishedAt: row.published_at?.toISOString() ?? null,
    saleEvent: row.sale_event
      ? {
          title: row.sale_event.title,
          description: row.sale_event.description,
          discountType: row.sale_event.discount_type,
          discountValue: row.sale_event.discount_value,
          startDate: row.sale_event.start_date.toISOString(),
          endDate: row.sale_event.end_date.toISOString(),
        }
      : null,
    growth: growth
      ? {
          anchorLabel: growth.anchorLabel,
          opportunityReason: growth.opportunityReason,
          audience: growth.audience,
        }
      : null,
    targets: row.targets.map((target) => ({
      id: target.id,
      status: target.status,
      lastError: target.last_error,
      publishedAt: target.published_at?.toISOString() ?? null,
      remotePermalink: target.remote_permalink,
      connection: {
        platform: target.social_connection.platform,
        displayName: target.social_connection.display_name,
        status: target.social_connection.status,
      },
    })),
  };
}

function toMetrics(posts: OwnerSocialPostPreviewPost[]) {
  return {
    totalPosts: posts.length,
    drafts: posts.filter((post) => post.status === "DRAFT").length,
    ready: posts.filter((post) => post.status === "READY").length,
    publishing: posts.filter((post) => post.status === "PUBLISHING").length,
    published: posts.filter((post) => post.status === "PUBLISHED").length,
    failed: posts.filter((post) => post.status === "FAILED").length,
  };
}

export async function resolveOwnerSocialPostsPreviewReadModel(
  businessSlug: string,
  userId: string,
): Promise<OwnerSocialPostsPreviewResult> {
  const actor = await resolveTenantActorContext(businessSlug, userId);
  if (!actor.success || actor.actorType !== "OWNER") {
    return {
      success: false,
      reason: "FORBIDDEN",
      error: "You do not have access to this owner preview.",
    };
  }

  try {
    const business = await prisma.business.findFirst({
      where: {
        id: actor.businessId,
        slug: businessSlug,
        owners: {
          some: {
            id: actor.ownerId,
            user_id: userId,
          },
        },
      },
      select: { id: true, slug: true, name: true, imageUrl: true },
    });

    if (!business) {
      return {
        success: false,
        reason: "NOT_FOUND",
        error: "Business not found.",
      };
    }

    const [postRows, connectionRows, assetRows] = await Promise.all([
      prisma.socialPost.findMany({
        where: { business_id: business.id },
        select: {
          id: true,
          title: true,
          status: true,
          caption_draft: true,
          caption_final: true,
          hashtags: true,
          media_url: true,
          last_error: true,
          created_at: true,
          published_at: true,
          sale_event: {
            select: {
              title: true,
              description: true,
              discount_type: true,
              discount_value: true,
              start_date: true,
              end_date: true,
            },
          },
          growth_campaigns: {
            select: { opportunity_snapshot: true },
            orderBy: { created_at: "desc" },
            take: 1,
          },
          targets: {
            orderBy: { created_at: "asc" },
            select: {
              id: true,
              status: true,
              last_error: true,
              published_at: true,
              remote_permalink: true,
              social_connection: {
                select: {
                  platform: true,
                  display_name: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.socialConnection.findMany({
        where: { business_id: business.id },
        select: { id: true, platform: true, display_name: true, status: true },
        orderBy: { platform: "asc" },
      }),
      prisma.brandAsset.findMany({
        where: { business_id: business.id, kind: "REFERENCE" },
        select: { id: true, url: true, alt: true, reference_subject: true },
        orderBy: { created_at: "desc" },
      }),
    ]);

    const posts = (postRows as unknown as OwnerSocialPostPreviewQueryRow[]).map(
      toOwnerSocialPostPreviewDto,
    );

    return {
      success: true,
      data: {
        section: "social-posts",
        generatedAt: new Date().toISOString(),
        business: {
          slug: business.slug,
          name: business.name,
          imageUrl: business.imageUrl,
        },
        metrics: toMetrics(posts),
        connections: (connectionRows as OwnerSocialPreviewConnectionRow[]).map(
          (connection) => ({
            id: connection.id,
            platform: connection.platform,
            displayName: connection.display_name,
            status: connection.status,
          }),
        ),
        referenceAssets: (assetRows as OwnerSocialPreviewAssetRow[]).map(
          (asset) => ({
            id: asset.id,
            url: asset.url,
            alt: asset.alt,
            referenceSubject: asset.reference_subject,
          }),
        ),
        posts,
      },
    };
  } catch {
    return {
      success: false,
      reason: "LOAD_FAILED",
      error: "Social posts could not be loaded. Refresh and try again.",
    };
  }
}
