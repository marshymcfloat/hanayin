import {
  generateSocialCaptionVariants,
  type SocialCaptionStyle,
} from "@/lib/services/social/caption-generator";
import type { CaptionStyle, CaptionVariant, GeneratedOffer } from "@/lib/services/growth/types";
import type { CaptionTone } from "@/lib/zod-schemas/growth";

const STYLE_ORDER: CaptionStyle[] = [
  "INFORMATIVE",
  "FUNNY_LIGHT",
  "URGENCY_DRIVEN",
  "PREMIUM_TONE",
  "QUESTION_ENGAGEMENT",
];

function toCaptionStyle(style: SocialCaptionStyle): CaptionStyle {
  return style as CaptionStyle;
}

export async function generateCaptionVariants(input: {
  businessSlug: string;
  businessName: string;
  businessType: string;
  opportunityReason: string;
  offer: GeneratedOffer;
  toneProfile: string;
  serviceNames?: string[];
  serviceCategories?: string[];
  packageNames?: string[];
  /**
   * Owner-selected (or engine-recommended) caption tone. The downstream
   * caption generator uses this to bias the LLM voice — playful vs premium
   * vs urgent etc.
   */
  captionTone?: CaptionTone;
  /**
   * Free-text owner direction merged into the LLM prompt. Lets the owner
   * push specific angles ("lean into the bestie-bonding angle", "mention
   * the rainy season").
   */
  ownerCaptionDirection?: string;
}): Promise<CaptionVariant[]> {
  const isDiscount = input.offer.actionCategory === "DISCOUNT";
  // Use the offer's publicDescription (already built for public consumption
  // by buildPublicSaleDescription) rather than the raw opportunityReason —
  // the latter is internal copy like "WEEKEND_PREP window is active" which
  // produces vague filler when fed to the caption rescue path.
  const saleDescription =
    input.offer.publicDescription?.trim() || input.opportunityReason;
  const variants = await generateSocialCaptionVariants({
    businessSlug: input.businessSlug,
    businessName: input.businessName,
    businessDescription: `${input.businessType} - ${input.toneProfile}`,
    saleTitle: input.offer.title,
    saleDescription,
    discountType: isDiscount ? "PERCENTAGE" : undefined,
    discountValue: isDiscount ? (input.offer.mechanics.discountPercent || 0) : undefined,
    startDate: input.offer.timeWindowStart,
    endDate: input.offer.timeWindowEnd,
    serviceNames: input.serviceNames,
    serviceCategories: input.serviceCategories,
    packageNames: input.packageNames,
    allowRewritePass: true,
    actionCategory: input.offer.actionCategory,
    captionTone: input.captionTone,
    ownerCaptionDirection: input.ownerCaptionDirection,
  });

  const mapped = variants.map((variant) => ({
    style: toCaptionStyle(variant.style),
    text: variant.caption,
    hashtags: variant.hashtags,
    ctaOptions: variant.ctaOptions,
    overlaySuggestion: variant.overlaySuggestion,
  }));

  return STYLE_ORDER.map((style) => {
    const existing = mapped.find((entry) => entry.style === style);
    if (existing) return existing;
    return mapped[0] || {
      style,
      text: input.offer.title,
      hashtags: ["#ServiceFlow", "#BookNow"],
      ctaOptions: ['DM "BOOK" to reserve.'],
      overlaySuggestion: input.offer.title.toUpperCase().slice(0, 32),
    };
  });
}
