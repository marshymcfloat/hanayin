import {
  generateSocialCaptionVariants,
  type SocialCaptionStyle,
} from "@/lib/services/social/caption-generator";
import type { CaptionStyle, CaptionVariant, GeneratedOffer } from "@/lib/services/growth/types";

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
}): Promise<CaptionVariant[]> {
  const isDiscount = input.offer.actionCategory === "DISCOUNT";
  const variants = await generateSocialCaptionVariants({
    businessSlug: input.businessSlug,
    businessName: input.businessName,
    businessDescription: `${input.businessType} - ${input.toneProfile}`,
    saleTitle: input.offer.title,
    saleDescription: input.opportunityReason,
    discountType: isDiscount ? "PERCENTAGE" : undefined,
    discountValue: isDiscount ? (input.offer.mechanics.discountPercent || 0) : undefined,
    startDate: input.offer.timeWindowStart,
    endDate: input.offer.timeWindowEnd,
    serviceNames: input.serviceNames,
    serviceCategories: input.serviceCategories,
    packageNames: input.packageNames,
    allowRewritePass: true,
    actionCategory: input.offer.actionCategory,
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

