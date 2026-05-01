import { z } from "zod";

// Caption tone options surfaced on the Growth Opportunity drafting dialog.
// AUTO defers to the engine's recommendCampaignStyling output. The other
// values bias the LLM prompt toward a specific voice register.
export const captionToneSchema = z.enum([
  "AUTO",
  "FRIENDLY_TAGLISH",
  "PREMIUM_LUXURY",
  "WITTY_PLAYFUL",
  "WARM_NURTURING",
  "DIRECT_URGENT",
]);
export type CaptionTone = z.infer<typeof captionToneSchema>;

// Image profile mirrors the SOCIAL_IMAGE_PROFILES list in image-profiles.ts.
// We accept any string so older drafts don't fail validation; downstream code
// falls back to DEFAULT_SOCIAL_IMAGE_PROFILE when the value is unrecognized.
export const imageProfileSchema = z.string().min(1);

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
  overrides: z
    .object({
      discountPercent: z.coerce.number().min(1).max(80).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      slotLimit: z.coerce.number().int().min(1).optional(),
    })
    .optional(),
  // Owner styling preferences (all optional; engine picks sensible defaults
  // when omitted via recommendCampaignStyling).
  styling: z
    .object({
      captionTone: captionToneSchema.optional(),
      ownerCaptionDirection: z.string().trim().max(400).optional(),
      imageProfile: imageProfileSchema.optional(),
      ownerImageDirection: z.string().trim().max(400).optional(),
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

