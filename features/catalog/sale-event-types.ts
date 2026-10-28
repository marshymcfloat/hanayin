import type { DiscountType, SocialPlatform } from "@/prisma/generated/prisma/enums";
import type { SocialImageProfile } from "@/lib/services/social/image-profiles";
import type { ConditionalSale } from "@/features/catalog/offer-definitions";

export type CreateSaleEventParams = {
  conditionalRule?: ConditionalSale | null; expectedRevision?: number;
  businessSlug: string; title: string; description?: string; startDate: Date; endDate: Date;
  discountType: DiscountType; discountValue: number; serviceIds: number[]; packageIds: number[];
  createSocialDraft?: boolean; targetPlatforms?: SocialPlatform[]; socialCaptionOverride?: string;
  socialMediaUrl?: string; socialImageProfile?: SocialImageProfile; socialImageDirection?: string;
  slotLimit?: number | null;
};
export type UpdateSaleEventParams = Pick<CreateSaleEventParams, "businessSlug" | "title" | "description" | "startDate" | "endDate" | "discountType" | "discountValue" | "serviceIds" | "packageIds" | "slotLimit" | "conditionalRule" | "expectedRevision"> & { id: number };
export type PreparedSaleSocialDraft = {
  targets: { id: string; platform: SocialPlatform }[];
  caption: string; hashtags: string[]; captionFinal: string | null; mediaUrl: string | null;
};
