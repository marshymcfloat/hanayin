import type {
  DiscountType,
  SocialConnectionStatus,
  SocialPlatform,
  SocialPostStatus,
  SocialTargetStatus,
} from "@/prisma/generated/prisma/enums";

export type OwnerSocialPostPreviewTarget = {
  id: string;
  status: SocialTargetStatus;
  lastError: string | null;
  publishedAt: string | null;
  remotePermalink: string | null;
  connection: {
    platform: SocialPlatform;
    displayName: string;
    status: SocialConnectionStatus;
  };
};

export type OwnerSocialPostPreviewPost = {
  id: string;
  title: string;
  status: SocialPostStatus;
  caption: string;
  hashtags: string[];
  mediaUrl: string | null;
  lastError: string | null;
  createdAt: string;
  publishedAt: string | null;
  saleEvent: {
    title: string;
    description: string | null;
    discountType: DiscountType;
    discountValue: number;
    startDate: string;
    endDate: string;
  } | null;
  growth: {
    anchorLabel: string;
    opportunityReason: string;
    audience: string;
  } | null;
  targets: OwnerSocialPostPreviewTarget[];
};

export type OwnerSocialPostsPreviewData = {
  section: "social-posts";
  generatedAt: string;
  deliveryUpdatedAt?: string;
  business: {
    slug: string;
    name: string;
    imageUrl: string | null;
  };
  metrics: {
    totalPosts: number;
    drafts: number;
    ready: number;
    publishing: number;
    published: number;
    failed: number;
  };
  connections: Array<{
    id: string;
    platform: SocialPlatform;
    displayName: string;
    status: SocialConnectionStatus;
  }>;
  referenceAssets: Array<{
    id: string;
    url: string;
    alt: string | null;
    referenceSubject: string | null;
  }>;
  posts: OwnerSocialPostPreviewPost[];
};
