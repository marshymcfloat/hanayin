/**
 * Wave I3 — Smart-default inference for social-post creation.
 *
 * The Create Organic Post dialog used to ask owners for nine fields
 * (topic, post type, caption tone, caption direction, mood, visual
 * focus, image style, image direction, generate-image-now). Most
 * owners want to type a title and click Generate; everything else
 * should be the AI's decision the owner *can* override, not a form
 * the owner *has* to fill.
 *
 * `inferCreativeBrief` is the pure function that turns a minimal
 * `(category, topic[, businessType])` input into a full creative
 * brief: caption tone, visual mood, visual focus, image profile, and
 * a one-line rationale we can show in the UI ("AI styled this as a
 * Tips & Education post — Soft Editorial, Friendly Taglish voice").
 *
 * The function is also reused by Wave I4 to auto-pick image styles
 * for growth-engine sale posts via `inferCreativeBriefForOffer`,
 * keeping the (offer type, theme) → (image profile, tone) mapping
 * in one place.
 *
 * Topic refinement:
 *   - Medical/procedural keywords (lipo, botox, peel, microneedling)
 *     bias toward modern-graphic / clinical compositions. They look
 *     out of place on a soft-editorial spa shot.
 *   - "Before / after" topics bias toward photo-realistic so the
 *     transformation reads naturally.
 *   - Otherwise, the category default stands.
 */

import {
  DEFAULT_SOCIAL_IMAGE_PROFILE,
  type SocialImageProfile,
} from "@/lib/services/social/image-profiles";
import type { OrganicPostCategory } from "@/lib/services/social/caption-generator";

/** Subset of `CaptionGenerationInput["captionTone"]` excluding "AUTO" — the
 *  inference helper always commits to a concrete tone so the UI has
 *  something to display. AUTO is the dialog's pre-inference default. */
export type InferredCaptionTone =
  | "FRIENDLY_TAGLISH"
  | "PREMIUM_LUXURY"
  | "WITTY_PLAYFUL"
  | "WARM_NURTURING"
  | "DIRECT_URGENT";

export type CreativeBrief = {
  captionTone: InferredCaptionTone;
  /** Free-text mood label. Matches the dialog's MOOD_OPTIONS values. */
  mood: string;
  /** Free-text visual focus. Matches the dialog's VISUAL_FOCUS_OPTIONS values. */
  visualFocus: string;
  imageProfile: SocialImageProfile;
  /** Optional hand-off lines fed into the caption / image prompts. */
  captionDirection?: string;
  imageDirection?: string;
  /** One-liner the UI shows above "Tune further" so owners know what
   *  the AI picked and can override if it's off-base. */
  rationale: string;
};

export type BusinessTypeLiteralForBrief =
  | "SALON"
  | "SPA"
  | "CLINIC"
  | "BARBERSHOP";

// ─── Topic-keyword refinement ────────────────────────────────────────────────

const MEDICAL_PROCEDURAL_TOKENS = [
  "lipo",
  "lipo suction",
  "liposuction",
  "botox",
  "filler",
  "peel",
  "microneedling",
  "hifu",
  "rf",
  "radiofrequency",
  "thread lift",
  "laser",
  "ipl",
  "skin tag",
  "mole",
  "wart",
  "cyst",
  "vein",
  "varicose",
  "hair transplant",
  "prp",
] as const;

const TRANSFORMATION_TOKENS = [
  "before / after",
  "before/after",
  "before and after",
  "transformation",
  "glow up",
  "makeover",
] as const;

function topicMentions(topic: string, tokens: readonly string[]): boolean {
  const haystack = topic.toLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

// ─── Per-category brief defaults ─────────────────────────────────────────────

function baseBriefForCategory(category: OrganicPostCategory): CreativeBrief {
  switch (category) {
    case "TIPS_EDUCATION":
      return {
        captionTone: "FRIENDLY_TAGLISH",
        mood: "clean and professional",
        visualFocus: "beauty products and tools flat-lay",
        imageProfile: "EDUCATIONAL",
        rationale:
          "Tip-card visual with negative space for an overlay headline.",
      };
    case "BEHIND_THE_SCENES":
      return {
        captionTone: "WARM_NURTURING",
        mood: "warm and relaxing",
        visualFocus: "behind the scenes staff preparation",
        imageProfile: "PHOTO_REALISTIC",
        rationale:
          "Realistic photography for an authentic behind-the-scenes feel.",
      };
    case "SEASONAL_GREETING":
      return {
        captionTone: "WARM_NURTURING",
        mood: "warm and relaxing",
        visualFocus: "spa or salon ambiance and space",
        imageProfile: "WARM_EDITORIAL",
        rationale:
          "Warm editorial lighting for a seasonal, human feel.",
      };
    case "TEAM_SPOTLIGHT":
      return {
        captionTone: "WARM_NURTURING",
        mood: "warm and relaxing",
        visualFocus: "genuine team portrait",
        imageProfile: "PHOTO_REALISTIC",
        rationale:
          "Realistic portrait of the team — earned warmth, not stock.",
      };
    case "SERVICE_SHOWCASE":
      return {
        captionTone: "PREMIUM_LUXURY",
        mood: "elegant and premium",
        visualFocus: "client receiving treatment",
        imageProfile: "SOFT_EDITORIAL",
        rationale:
          "Premium editorial spotlight on the service experience.",
      };
    case "GENERAL":
    default:
      return {
        captionTone: "FRIENDLY_TAGLISH",
        mood: "warm and relaxing",
        visualFocus: "spa or salon ambiance and space",
        imageProfile: DEFAULT_SOCIAL_IMAGE_PROFILE,
        rationale: "Soft editorial — safe everyday voice.",
      };
  }
}

// ─── Topic refinement layer ──────────────────────────────────────────────────

function refineForTopic(
  brief: CreativeBrief,
  topic: string,
  category: OrganicPostCategory,
): CreativeBrief {
  const trimmed = topic.trim();
  if (!trimmed) return brief;

  // Medical / procedural topics: bias toward MODERN_GRAPHIC for a
  // cleaner, more clinical composition. Educational posts about
  // procedures benefit from the diagrammatic energy; soft-editorial
  // spa visuals undersell the seriousness of the topic.
  if (
    topicMentions(trimmed, MEDICAL_PROCEDURAL_TOKENS) &&
    (category === "TIPS_EDUCATION" || category === "SERVICE_SHOWCASE")
  ) {
    return {
      ...brief,
      imageProfile: "MODERN_GRAPHIC",
      visualFocus: "beauty products and tools flat-lay",
      rationale:
        "Clinical-graphic profile to match a procedural / medical topic.",
    };
  }

  // Transformation / before-after: realistic photo so the result
  // reads as authentic, not editorial.
  if (topicMentions(trimmed, TRANSFORMATION_TOKENS)) {
    return {
      ...brief,
      imageProfile: "PHOTO_REALISTIC",
      visualFocus: "client receiving treatment",
      rationale: "Realistic photography to anchor the transformation story.",
    };
  }

  return brief;
}

/**
 * Public entry point for organic posts.
 */
export function inferCreativeBrief(input: {
  category: OrganicPostCategory;
  topic: string;
  businessType?: BusinessTypeLiteralForBrief;
}): CreativeBrief {
  const base = baseBriefForCategory(input.category);

  // Business-type tilt: barbershops trend more direct/witty,
  // clinics more clean/clinical. Subtle on top of the category base.
  const tilted: CreativeBrief = (() => {
    switch (input.businessType) {
      case "BARBERSHOP":
        return input.category === "SERVICE_SHOWCASE"
          ? {
              ...base,
              captionTone: "WITTY_PLAYFUL",
              imageProfile: "BOLD_MONOCHROME",
              rationale:
                "Bold monochrome with a witty edge — barbershop default.",
            }
          : base;
      case "CLINIC":
        return input.category === "TIPS_EDUCATION"
          ? {
              ...base,
              imageProfile: "MODERN_GRAPHIC",
              rationale:
                "Modern-graphic profile for clinical educational tone.",
            }
          : base;
      default:
        return base;
    }
  })();

  return refineForTopic(tilted, input.topic, input.category);
}

// ─── Sale-event / growth-engine path (Wave I4) ──────────────────────────────

export type OfferTypeLiteralForBrief =
  | "FLASH_DEAL"
  | "LIMITED_SLOTS"
  | "BUNDLE"
  | "STUDENT_PROMO"
  | "PAYDAY_PROMO"
  | "SOCIAL_REMINDER"
  | "CONTENT_POST"
  | "LOYALTY_REWARD"
  | "THEMED_PACKAGE"
  | "SEASONAL_PROMO";

/**
 * Brief for a growth-engine recommendation. Maps offer type to image
 * profile + tone so the engine never produces a Soft-Editorial
 * caption-and-image for a flash deal that should be punchy and
 * urgent (and vice versa for premium loyalty rewards).
 */
export function inferCreativeBriefForOffer(input: {
  offerType: OfferTypeLiteralForBrief;
  topic: string;
  businessType?: BusinessTypeLiteralForBrief;
}): CreativeBrief {
  const base: CreativeBrief = (() => {
    switch (input.offerType) {
      case "FLASH_DEAL":
      case "LIMITED_SLOTS":
        return {
          captionTone: "DIRECT_URGENT",
          mood: "clean and professional",
          visualFocus: "beauty products and tools flat-lay",
          imageProfile: "BOLD_MONOCHROME",
          rationale:
            "Bold monochrome + direct voice — flash / limited-slots energy.",
        };
      case "BUNDLE":
      case "STUDENT_PROMO":
      case "PAYDAY_PROMO":
        return {
          captionTone: "FRIENDLY_TAGLISH",
          mood: "playful and fun",
          visualFocus: "client receiving treatment",
          imageProfile: "MODERN_GRAPHIC",
          rationale: "Playful modern graphic — bundle / promo voice.",
        };
      case "SOCIAL_REMINDER":
        return {
          captionTone: "FRIENDLY_TAGLISH",
          mood: "warm and relaxing",
          visualFocus: "spa or salon ambiance and space",
          imageProfile: "WARM_EDITORIAL",
          rationale:
            "Warm editorial — friendly social reminder, no urgency.",
        };
      case "CONTENT_POST":
        return {
          captionTone: "FRIENDLY_TAGLISH",
          mood: "clean and professional",
          visualFocus: "beauty products and tools flat-lay",
          imageProfile: "SOFT_EDITORIAL",
          rationale:
            "Soft editorial for an educational / content post — let the topic lead.",
        };
      case "LOYALTY_REWARD":
        return {
          captionTone: "WARM_NURTURING",
          mood: "elegant and premium",
          visualFocus: "client receiving treatment",
          imageProfile: "SOFT_EDITORIAL",
          rationale:
            "Soft editorial + warm voice — loyalty appreciation tone.",
        };
      case "THEMED_PACKAGE":
      case "SEASONAL_PROMO":
        return {
          captionTone: "PREMIUM_LUXURY",
          mood: "elegant and premium",
          visualFocus: "spa or salon ambiance and space",
          imageProfile: "WARM_EDITORIAL",
          rationale:
            "Warm editorial + premium voice — themed / seasonal package.",
        };
    }
  })();

  // Same topic refinement as organic — medical/procedural promo
  // posts still want the cleaner clinical look.
  if (topicMentions(input.topic, MEDICAL_PROCEDURAL_TOKENS)) {
    return {
      ...base,
      imageProfile: "MODERN_GRAPHIC",
      rationale:
        "Clinical-graphic override — promotional but the topic is procedural.",
    };
  }

  if (topicMentions(input.topic, TRANSFORMATION_TOKENS)) {
    return {
      ...base,
      imageProfile: "PHOTO_REALISTIC",
      visualFocus: "client receiving treatment",
      rationale:
        "Realistic photography — promo built around a transformation.",
    };
  }

  return base;
}
