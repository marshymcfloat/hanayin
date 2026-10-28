/** Growth workflow boundary schemas and shared input types. */
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
export const imageProfileSchema = z.string().min(1).max(100);
export const growthBusinessSlugSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);

function boundedEventMetadata(value: Record<string, unknown>) {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++count > 1000 || entry.depth > 5) return false;
    if (entry.value === null || typeof entry.value === "boolean") continue;
    if (typeof entry.value === "string") { if (entry.value.length > 2000) return false; continue; }
    if (typeof entry.value === "number") { if (!Number.isFinite(entry.value)) return false; continue; }
    if (!entry.value || typeof entry.value !== "object") return false;
    if (!Array.isArray(entry.value) && Object.getPrototypeOf(entry.value) !== Object.prototype && Object.getPrototypeOf(entry.value) !== null) return false;
    const values = Array.isArray(entry.value) ? entry.value : Object.entries(entry.value);
    if (values.length > 100) return false;
    if (Array.isArray(entry.value)) for (const item of entry.value) pending.push({ value: item, depth: entry.depth + 1 });
    else for (const [key, item] of Object.entries(entry.value)) { if (key.length > 100) return false; pending.push({ value: item, depth: entry.depth + 1 }); }
  }
  try { const serialized = JSON.stringify(value); return typeof serialized === "string" && serialized.length <= 16000; } catch { return false; }
}

export const generateGrowthCampaignSchema = z.object({
  businessSlug: growthBusinessSlugSchema,
  opportunityId: z.string().min(1).max(200),
  selectedServiceIds: z.array(z.coerce.number().int().positive().max(2_147_483_647)).max(100).default([]),
  selectedPackageIds: z.array(z.coerce.number().int().positive().max(2_147_483_647)).max(100).default([]),
  constraints: z
    .object({
      maxDiscountPercent: z.coerce.number().min(1).max(80).optional(),
    })
    .optional(),
  overrides: z
    .object({
      discountPercent: z.coerce.number().min(1).max(80).optional(),
      startDate: z.string().max(100).optional(),
      endDate: z.string().max(100).optional(),
      slotLimit: z.coerce.number().int().min(1).max(1_000_000).optional(),
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
  businessSlug: growthBusinessSlugSchema,
  campaignId: z.string().min(1).max(200),
  eventType: campaignEventTypeSchema,
  value: z.coerce.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).refine(boundedEventMetadata, "Invalid campaign event metadata.").optional(),
});
