/**
 * Engine-recommended defaults for caption tone + image profile, based on
 * the opportunity type and the dominant service category. Owners can
 * override either choice on the drafting dialog; this just provides a smart
 * starting point so they don't have to think about it for every campaign.
 */

import type { OpportunityTypeLiteral } from "@/lib/services/growth/types";
import type { CaptionTone } from "@/lib/zod-schemas/growth";
import type { SocialImageProfile } from "@/lib/services/social/image-profiles";
import { DEFAULT_SOCIAL_IMAGE_PROFILE } from "@/lib/services/social/image-profiles";

export type CampaignStylingRecommendation = {
  captionTone: CaptionTone;
  imageProfile: SocialImageProfile;
  rationale: string;
};

// Same alias map shape as the offer-generator's title helper, but defined
// locally so this module stays a small leaf with no surprise imports.
const CATEGORY_KEYS = [
  "EYELASH",
  "BROW",
  "NAILS",
  "SKIN",
  "FACIAL",
  "MASSAGE",
  "SPA",
  "HAIR",
  "MAKEUP",
  "BODY",
  "WAXING",
] as const;
type CategoryKey = (typeof CATEGORY_KEYS)[number];

const ALIAS_TO_CATEGORY: Record<string, CategoryKey> = {
  EYELASH: "EYELASH",
  EYELASHES: "EYELASH",
  LASH: "EYELASH",
  LASHES: "EYELASH",
  BROW: "BROW",
  BROWS: "BROW",
  EYEBROW: "BROW",
  EYEBROWS: "BROW",
  NAIL: "NAILS",
  NAILS: "NAILS",
  MANICURE: "NAILS",
  PEDICURE: "NAILS",
  SKIN: "SKIN",
  SKINCARE: "SKIN",
  FACIAL: "FACIAL",
  FACIALS: "FACIAL",
  FACE: "FACIAL",
  MASSAGE: "MASSAGE",
  MASSAGES: "MASSAGE",
  SPA: "SPA",
  WELLNESS: "SPA",
  HAIR: "HAIR",
  HAIRCUT: "HAIR",
  COLOR: "HAIR",
  COLORING: "HAIR",
  MAKEUP: "MAKEUP",
  COSMETICS: "MAKEUP",
  BODY: "BODY",
  WAXING: "WAXING",
  WAX: "WAXING",
};

function inferCategory(
  serviceCategories: string[],
  serviceNames: string[],
): CategoryKey | null {
  const haystack = [...serviceCategories, ...serviceNames]
    .map((value) => value.toUpperCase())
    .join(" ");
  if (!haystack.trim()) return null;

  const scores = new Map<CategoryKey, number>();
  for (const [alias, key] of Object.entries(ALIAS_TO_CATEGORY)) {
    if (new RegExp(`\\b${alias}\\b`).test(haystack)) {
      scores.set(key, (scores.get(key) ?? 0) + 1);
    }
  }
  let best: CategoryKey | null = null;
  let bestScore = 0;
  for (const [key, score] of scores) {
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Map service category → image profile. Bias toward warm-editorial for
 * skin/face/body/spa work where dewy editorial macros sell best, modern
 * graphic for nails/makeup which photograph well on bold backgrounds, soft
 * editorial as a clean default elsewhere.
 */
function categoryImageProfile(category: CategoryKey | null): SocialImageProfile {
  switch (category) {
    case "EYELASH":
    case "BROW":
      return "WARM_EDITORIAL";
    case "NAILS":
    case "MAKEUP":
      return "MODERN_GRAPHIC";
    case "SKIN":
    case "FACIAL":
    case "BODY":
      return "WARM_EDITORIAL";
    case "MASSAGE":
    case "SPA":
      return "SOFT_EDITORIAL";
    case "HAIR":
      return "PHOTO_REALISTIC";
    case "WAXING":
      return "SOFT_EDITORIAL";
    default:
      return DEFAULT_SOCIAL_IMAGE_PROFILE;
  }
}

/**
 * Map opportunity type → caption tone. PAYDAY and SLOW_HOURS lean urgent
 * because the booking window is narrow; HOLIDAY and ANNIVERSARY lean warm/
 * premium because the audience is in a treat-yourself mood; WIN_BACK leans
 * nurturing to feel like an invitation rather than a guilt trip.
 */
function opportunityCaptionTone(type: OpportunityTypeLiteral): CaptionTone {
  switch (type) {
    case "PAYDAY_SPIKE":
      return "DIRECT_URGENT";
    case "SLOW_HOURS":
      return "FRIENDLY_TAGLISH";
    case "WEEKEND_PREP":
      return "FRIENDLY_TAGLISH";
    case "HOLIDAY_SEASONAL":
      return "PREMIUM_LUXURY";
    case "WEATHER_HOOK":
      return "WARM_NURTURING";
    case "ANNIVERSARY":
      return "PREMIUM_LUXURY";
    case "WIN_BACK":
      return "WARM_NURTURING";
    default:
      return "FRIENDLY_TAGLISH";
  }
}

/**
 * One-shot recommendation surfaced both in the dialog (as the pre-selected
 * choice) and in the campaign-generation pipeline (as the default when no
 * styling block is provided).
 */
export function recommendCampaignStyling(input: {
  opportunityType: OpportunityTypeLiteral;
  serviceCategories?: string[];
  serviceNames?: string[];
}): CampaignStylingRecommendation {
  const category = inferCategory(
    input.serviceCategories ?? [],
    input.serviceNames ?? [],
  );
  const captionTone = opportunityCaptionTone(input.opportunityType);
  const imageProfile = categoryImageProfile(category);

  const categoryLabel = category ? category.toLowerCase() : "general";
  const rationale = `${input.opportunityType.toLowerCase().replace(/_/g, " ")} opportunity targeting ${categoryLabel} services → ${captionTone.toLowerCase().replace(/_/g, " ")} voice + ${imageProfile.toLowerCase().replace(/_/g, " ")} visuals`;

  return { captionTone, imageProfile, rationale };
}
