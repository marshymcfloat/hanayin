import type { GeneratedOffer, OpportunityTypeLiteral } from "./types";

export type CampaignCreativeAnchor = "RAINY_SEASON_COMFORT" | "HOT_WEATHER_REFRESH" | "SEASONAL_MOMENT" | "CAPACITY_FILL" | "PAYDAY_TREAT" | "WEEKEND_PREP" | "WIN_BACK" | "GENERAL_CAMPAIGN";

export interface CampaignCreativeContext {
  version: 1;
  opportunityType: OpportunityTypeLiteral;
  opportunityReason: string;
  anchor: CampaignCreativeAnchor;
  anchorLabel: string;
  requiredContext: string;
  campaignIntent: string;
  audience: string;
  visualMood: string;
  visualSubject: string;
  visualBrief: string;
  services: string[];
  serviceCategories: string[];
  packages: string[];
  imageProfile: string;
  captionTone: string;
  ownerCaptionDirection?: string;
  ownerImageDirection?: string;
  weather?: { condition?: string | null; summary?: string | null; precipitationProbability?: number | null; localityName?: string | null };
}

const cleanText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const cleanNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function buildCampaignCreativeContext(input: {
  opportunity: { type: string; reason: string; metadata?: unknown };
  offer: GeneratedOffer;
  serviceNames: string[];
  serviceCategories: string[];
  packageNames: string[];
  imageProfile: string;
  captionTone: string;
  ownerCaptionDirection?: string;
  ownerImageDirection?: string;
}): CampaignCreativeContext {
  const metadata = input.opportunity.metadata && typeof input.opportunity.metadata === "object" ? input.opportunity.metadata as Record<string, unknown> : {};
  const weatherCondition = cleanText(metadata.weatherCondition);
  const signal = [weatherCondition, cleanText(metadata.weatherSummary), input.opportunity.reason].filter(Boolean).join(" ");
  const rainy = input.opportunity.type === "WEATHER_HOOK" && /rain|storm|monsoon|ulan/i.test(signal);
  const hot = input.opportunity.type === "WEATHER_HOOK" && /hot|heat|sun/i.test(signal);
  const anchor: CampaignCreativeAnchor = rainy ? "RAINY_SEASON_COMFORT" : hot ? "HOT_WEATHER_REFRESH" : input.opportunity.type === "HOLIDAY_SEASONAL" ? "SEASONAL_MOMENT" : input.opportunity.type === "SLOW_HOURS" ? "CAPACITY_FILL" : input.opportunity.type === "PAYDAY_SPIKE" ? "PAYDAY_TREAT" : input.opportunity.type === "WEEKEND_PREP" ? "WEEKEND_PREP" : input.opportunity.type === "WIN_BACK" ? "WIN_BACK" : "GENERAL_CAMPAIGN";
  const configs: Record<CampaignCreativeAnchor, [string, string, string]> = {
    RAINY_SEASON_COMFORT: ["Rainy-season comfort", "Make rainy weather unmistakable and connect it naturally to indoor comfort, convenience, stress relief, or a restorative reset.", "Premium rainy-day refuge: visible rain or wet-city cues outside, warm calm treatment space inside, soft window light and believable Filipino monsoon atmosphere."],
    HOT_WEATHER_REFRESH: ["Hot-weather refresh", "Connect the offer to cooling down, freshness, and relief from hot weather.", "Fresh, airy, cooling light with restrained summer energy."],
    SEASONAL_MOMENT: ["Seasonal moment", "Make the detected seasonal moment visible and relevant to the service.", "Premium seasonal editorial styling without cliché decoration."],
    CAPACITY_FILL: ["Quiet-hours reset", "Frame the service as a convenient reset during quieter hours.", "Calm, unhurried, intimate midweek atmosphere."],
    PAYDAY_TREAT: ["Payday treat", "Frame the service as a considered payday self-care reward.", "Polished celebratory energy with restrained premium accents."],
    WEEKEND_PREP: ["Weekend-ready", "Connect the service to feeling ready and confident for the weekend.", "Fresh, confident, socially ready editorial energy."],
    WIN_BACK: ["Welcome-back care", "Make the message feel personal, warm, and welcoming to returning clients.", "Warm familiar care with human, authentic detail."],
    GENERAL_CAMPAIGN: ["Service-led campaign", "Keep the selected service and campaign intent visually and verbally explicit.", "Premium, modern and human beauty editorial."],
  };
  const [anchorLabel, requiredContext, visualMood] = configs[anchor];
  const focus = input.serviceNames.slice(0, 4).join(", ") || input.packageNames.slice(0, 3).join(", ") || input.serviceCategories.slice(0, 3).join(", ") || "the selected beauty or wellness service";
  const visualSubject = `${focus} as the single hero service subject`;
  return {
    version: 1, opportunityType: input.opportunity.type as OpportunityTypeLiteral, opportunityReason: input.opportunity.reason,
    anchor, anchorLabel, requiredContext, campaignIntent: `${input.offer.actionCategory}: ${input.offer.publicDescription}`,
    audience: "Local Filipino beauty and wellness clients ready to book within the campaign window.", visualMood, visualSubject,
    visualBrief: `${anchorLabel}. ${requiredContext} Show ${visualSubject}. Use one focal idea, a 60/40 or 70/30 composition, controlled palette, believable texture, and clean overlay-safe negative space.`,
    services: input.serviceNames, serviceCategories: input.serviceCategories, packages: input.packageNames,
    imageProfile: input.imageProfile, captionTone: input.captionTone, ownerCaptionDirection: input.ownerCaptionDirection, ownerImageDirection: input.ownerImageDirection,
    weather: input.opportunity.type === "WEATHER_HOOK" ? { condition: weatherCondition, summary: cleanText(metadata.weatherSummary), precipitationProbability: cleanNumber(metadata.precipitationProbability), localityName: cleanText(metadata.localityName) } : undefined,
  };
}

export function parseCampaignCreativeContext(value: unknown): CampaignCreativeContext | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const candidate = (record.creativeContext ?? record) as Partial<CampaignCreativeContext>;
  return candidate.version === 1 && !!candidate.anchor && !!candidate.requiredContext ? candidate as CampaignCreativeContext : null;
}
