import type { GeneratedOffer, OpportunityTypeLiteral } from "@/lib/services/growth/types";

function serializeList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "none";
}

export function buildOfferGeneratorPrompt(input: {
  businessName: string;
  businessType: string;
  opportunityType: OpportunityTypeLiteral;
  opportunityReason: string;
  selectedServices: string[];
  maxDiscountPercent: number;
  toneProfile: string;
}) {
  return [
    "Create one conversion-focused promo offer for a Philippine service business.",
    "Output valid JSON only.",
    "JSON schema:",
    '{"title":"string","mechanics":{"discountPercent":number,"bundleItems":["string"],"limitedSlots":number},"terms":["string"],"ctaKeyword":"string"}',
    "",
    `Business: ${input.businessName}`,
    `Business type: ${input.businessType}`,
    `Opportunity type: ${input.opportunityType}`,
    `Opportunity reason: ${input.opportunityReason}`,
    `Selected services: ${serializeList(input.selectedServices)}`,
    `Max discount percent: ${input.maxDiscountPercent}`,
    `Tone profile: ${input.toneProfile}`,
    "",
    "Rules:",
    "- No fake claims.",
    "- Avoid politics, tragedy, or sensitive topics.",
    "- Keep wording Taglish-friendly and natural.",
    "- Respect discount cap and slot scarcity.",
  ].join("\n");
}

export function buildCaptionGeneratorPrompt(input: {
  businessName: string;
  businessType: string;
  opportunityReason: string;
  offer: GeneratedOffer;
  toneProfile: string;
}) {
  return [
    "Write 5 high-converting social caption variants for a Filipino audience.",
    "Return JSON only with shape:",
    '{"captions":[{"style":"INFORMATIVE|FUNNY_LIGHT|URGENCY_DRIVEN|PREMIUM_TONE|QUESTION_ENGAGEMENT","text":"string","hashtags":["#one"],"ctaOptions":["string"],"overlaySuggestion":"string"}]}',
    "",
    `Business: ${input.businessName}`,
    `Business type: ${input.businessType}`,
    `Opportunity reason: ${input.opportunityReason}`,
    `Offer title: ${input.offer.title}`,
    `Offer type: ${input.offer.offerType}`,
    `Offer mechanics: ${JSON.stringify(input.offer.mechanics)}`,
    `Offer terms: ${input.offer.terms.join(" | ")}`,
    `Tone profile: ${input.toneProfile}`,
    "",
    "Rules:",
    "- Taglish but polished, natural, and non-cringey.",
    "- Each caption should be 7-11 lines and at least 65 words.",
    "- Use strong readability: short lines and clear spacing.",
    "- Make it persuasive, inviting, and specific to the offer.",
    "- No fake urgency or false claims.",
    "- Avoid politics, tragedy, disasters, or sensitive public events.",
    "- Keep CTA practical and booking-focused.",
    "- End each caption with these two lines exactly:",
    "You can book yourselves in and see all services they offer.",
    "https://www.serviceflow.store/<businessSlug>",
  ].join("\n");
}

export function buildImagePromptGeneratorPrompt(input: {
  businessName: string;
  businessType: string;
  offer: GeneratedOffer;
  captionHooks: string[];
}) {
  return [
    "Generate 3 image prompts for social promo creatives.",
    "Return JSON only with shape:",
    '{"prompts":[{"style":"CLEAN_EDITORIAL|LUXE_STUDIO|PLAYFUL_SOCIAL","prompt":"string","overlaySuggestion":"string"}]}',
    "",
    `Business: ${input.businessName}`,
    `Business type: ${input.businessType}`,
    `Offer title: ${input.offer.title}`,
    `Offer mechanics: ${JSON.stringify(input.offer.mechanics)}`,
    `Offer window: ${input.offer.timeWindowStart.toISOString()} to ${input.offer.timeWindowEnd.toISOString()}`,
    `Caption hooks: ${serializeList(input.captionHooks)}`,
    "",
    "Rules:",
    "- Keep text minimal and readable.",
    "- No external logos, no trademarked brands.",
    "- No sensitive or controversial themes.",
  ].join("\n");
}
