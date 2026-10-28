import type {
  DiscountType,
  SocialPlatform,
  SocialPostStatus,
  SocialTargetStatus,
} from "@/prisma/generated/prisma/enums";
import type { ConditionalSale } from "@/features/catalog/offer-definitions";

export type OwnerSaleEventPreviewStatus = "active" | "upcoming" | "ended";

export type OwnerSaleEventPreviewSocialTarget = {
  id: string;
  platform: SocialPlatform;
  status: SocialTargetStatus;
  lastError: string | null;
};

export type OwnerSaleEventPreviewSocialPost = {
  id: string;
  title: string;
  status: SocialPostStatus;
  lastError: string | null;
  publishedAt: string | null;
  targets: OwnerSaleEventPreviewSocialTarget[];
};

export type OwnerSaleEventPreviewEvent = {
  revision?: number;
  conditionalRule?: ConditionalSale | null;
  id: number;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: OwnerSaleEventPreviewStatus;
  discountType: DiscountType;
  discountValue: number;
  slotLimit: number | null;
  bookings: number;
  services: Array<{ id: number; name: string; category: string }>;
  packages: Array<{ id: number; name: string; category: string }>;
  socialPosts: OwnerSaleEventPreviewSocialPost[];
};

export type OwnerSaleEventPreviewData = {
  section: "sale-events";
  generatedAt: string;
  now: string;
  business: { slug: string; name: string };
  events: OwnerSaleEventPreviewEvent[];
  availableServices: Array<{ id: number; name: string; category: string; price?: number }>;
  availablePackages: Array<{ id: number; name: string; category: string }>;
  connectedPlatforms: SocialPlatform[];
  socialPublishingEnabled: boolean;
  metrics: {
    total: number;
    active: number;
    upcoming: number;
    ended: number;
    bookings: number;
    attention: number;
  };
};

export type OwnerSaleEventPreviewResult =
  | { success: true; data: OwnerSaleEventPreviewData }
  | {
      success: false;
      reason: "FORBIDDEN" | "NOT_FOUND" | "LOAD_FAILED";
      error: string;
    };

export function saleEventPreviewStatus(
  startDate: Date | string,
  endDate: Date | string,
  now: Date,
): OwnerSaleEventPreviewStatus {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const current = now.getTime();
  if (current < start) return "upcoming";
  if (current > end) return "ended";
  return "active";
}

export function filterOwnerSaleEventPreviewEvents(
  events: OwnerSaleEventPreviewEvent[],
  query: string,
  status: "all" | OwnerSaleEventPreviewStatus,
) {
  const normalized = query.trim().toLowerCase();
  return events.filter((event) => {
    const haystack = [
      event.title,
      event.description ?? "",
      ...event.services.map((item) => item.name),
      ...event.packages.map((item) => item.name),
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!normalized || haystack.includes(normalized)) &&
      (status === "all" || event.status === status)
    );
  });
}

export function socialPostNeedsAttention(
  post: Pick<OwnerSaleEventPreviewSocialPost, "status" | "lastError" | "targets">,
) {
  return (
    post.status === "FAILED" ||
    post.targets.some((target) => target.status === "FAILED") ||
    Boolean(post.lastError)
  );
}

export function canPublishLinkedSocialPost(post: OwnerSaleEventPreviewSocialPost) {
  return (
    (post.status === "DRAFT" || post.status === "READY") &&
    !socialPostNeedsAttention(post) &&
    !post.targets.some((target) => target.status === "QUEUED" || target.status === "PUBLISHING")
  );
}
