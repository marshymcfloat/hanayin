export type BusinessTypeLiteral = "SALON" | "SPA" | "CLINIC" | "BARBERSHOP";

export type OpportunityTypeLiteral =
  | "SLOW_HOURS"
  | "PAYDAY_SPIKE"
  | "WEEKEND_PREP"
  | "HOLIDAY_SEASONAL"
  | "WEATHER_HOOK"
  | "ANNIVERSARY"
  | "WIN_BACK";

export type OfferTypeLiteral =
  | "FLASH_DEAL"
  | "BUNDLE"
  | "LIMITED_SLOTS"
  | "STUDENT_PROMO"
  | "PAYDAY_PROMO"
  | "SEASONAL_PROMO"
  | "THEMED_PACKAGE"
  | "SOCIAL_REMINDER"
  | "CONTENT_POST"
  | "LOYALTY_REWARD";

export type ActionCategory = "DISCOUNT" | "SOCIAL_ONLY" | "AWARENESS";

const DISCOUNT_OFFER_TYPES: OfferTypeLiteral[] = [
  "FLASH_DEAL", "BUNDLE", "LIMITED_SLOTS",
  "STUDENT_PROMO", "PAYDAY_PROMO", "SEASONAL_PROMO",
];

export function getActionCategory(offerType: OfferTypeLiteral): ActionCategory {
  if (DISCOUNT_OFFER_TYPES.includes(offerType)) return "DISCOUNT";
  if (offerType === "THEMED_PACKAGE" || offerType === "LOYALTY_REWARD") return "SOCIAL_ONLY";
  return "AWARENESS";
}

export function isDiscountOffer(offerType: OfferTypeLiteral): boolean {
  return getActionCategory(offerType) === "DISCOUNT";
}

export type CaptionStyle =
  | "INFORMATIVE"
  | "FUNNY_LIGHT"
  | "URGENCY_DRIVEN"
  | "PREMIUM_TONE"
  | "QUESTION_ENGAGEMENT";

export type ImagePromptStyle = "CLEAN_EDITORIAL" | "LUXE_STUDIO" | "PLAYFUL_SOCIAL";

export type WeatherConditionLiteral =
  | "UNKNOWN"
  | "CLEAR"
  | "RAINY"
  | "STORM"
  | "HOT"
  | "COOL";

export interface DailyCapacitySummary {
  date: string;
  estimatedCapacitySlots: number;
  bookedSlots: number;
  openSlots: number;
}

export interface GrowthContextPayload {
  businessSlug: string;
  businessName: string;
  businessType: BusinessTypeLiteral;
  serviceCount: number;
  packageCount: number;
  providerCount: number;
  averageServiceDurationMinutes: number;
  averageServicePrice: number;
  dailyCapacity: DailyCapacitySummary[];
  weather?: {
    enabled: boolean;
    summary?: string;
    condition?: WeatherConditionLiteral;
    temperatureC?: number;
    precipitationProbability?: number;
    source?: string;
    observedAt?: string;
    localityName?: string;
  };
  seasonalitySignals: string[];
}

export interface OpportunityScoreBreakdown {
  urgency: number;
  impact: number;
  confidence: number;
  feasibility: number;
  total: number;
}

export interface OpportunityCandidate {
  type: OpportunityTypeLiteral;
  reason: string;
  timeWindowStart: Date;
  timeWindowEnd: Date;
  recommendedOfferTypes: OfferTypeLiteral[];
  urgency: number;
  impact: number;
  confidence: number;
  feasibility: number;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface GeneratedOffer {
  title: string;
  publicDescription: string;
  offerType: OfferTypeLiteral;
  actionCategory: ActionCategory;
  mechanics: {
    discountPercent?: number;
    bundleServiceIds?: number[];
    freebies?: string[];
    limitedSlots?: number;
    themeTitle?: string;
    messagingAngle?: string;
    contentTopic?: string;
    rewardDescription?: string;
  };
  timeWindowStart: Date;
  timeWindowEnd: Date;
  terms: string[];
  suggestedCtaKeyword: string;
  riskFlags: string[];
}

export interface CaptionVariant {
  style: CaptionStyle;
  text: string;
  hashtags: string[];
  ctaOptions: string[];
  overlaySuggestion: string;
}

export interface ImagePromptVariant {
  style: ImagePromptStyle;
  prompt: string;
  overlaySuggestion: string;
}

export interface PostingScheduleSuggestion {
  timestamp: Date;
  reason: string;
}

export interface OpportunityView {
  id: string;
  type: OpportunityTypeLiteral;
  reason: string;
  urgency: number;
  confidence: number;
  score: number;
  timeWindowStart: string;
  timeWindowEnd: string;
  recommendedOfferTypes: OfferTypeLiteral[];
  metadata: Record<string, unknown> | null;
  suggestedPostTimes: string[];
}

export interface GeneratedCampaignView {
  campaignId: string;
  opportunityId: string;
  offer: GeneratedOffer;
  captions: CaptionVariant[];
  imagePrompts: ImagePromptVariant[];
  schedule: PostingScheduleSuggestion[];
  saleEventId: number | null;
  socialPostId: string;
}
