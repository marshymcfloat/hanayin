import { z } from "zod";

export const generateGrowthCampaignSchema = z.object({
  businessSlug: z.string().min(1),
  opportunityId: z.string().min(1),
  selectedServiceIds: z.array(z.coerce.number().int().positive()).default([]),
  selectedPackageIds: z.array(z.coerce.number().int().positive()).default([]),
  constraints: z
    .object({
      maxDiscountPercent: z.coerce.number().min(1).max(80).optional(),
    })
    .optional(),
});

export const campaignEventTypeSchema = z.enum([
  "POST_PUBLISHED",
  "CLICK_RECORDED",
  "DM_INQUIRY",
  "BOOKING_ATTRIBUTED",
  "PROMO_REDEEMED",
  "MANUAL_FEEDBACK",
]);

export const trackGrowthCampaignEventSchema = z.object({
  businessSlug: z.string().min(1),
  campaignId: z.string().min(1),
  eventType: campaignEventTypeSchema,
  value: z.coerce.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

