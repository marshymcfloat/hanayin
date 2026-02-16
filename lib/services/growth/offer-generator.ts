import { getCurrentDateTimePH } from "@/lib/date-utils";
import { getTemplatesForBusinessType } from "@/lib/services/growth/templates";
import type {
  GeneratedOffer,
  OfferTypeLiteral,
  OpportunityTypeLiteral,
} from "@/lib/services/growth/types";

type ServiceLite = {
  id: number;
  name: string;
  price: number;
  duration: number | null;
};

const OFFER_BY_OPPORTUNITY: Record<OpportunityTypeLiteral, OfferTypeLiteral[]> = {
  SLOW_HOURS: ["FLASH_DEAL", "LIMITED_SLOTS", "BUNDLE"],
  PAYDAY_SPIKE: ["PAYDAY_PROMO", "LIMITED_SLOTS", "BUNDLE"],
  WEEKEND_PREP: ["LIMITED_SLOTS", "BUNDLE", "FLASH_DEAL"],
  HOLIDAY_SEASONAL: ["SEASONAL_PROMO", "BUNDLE", "LIMITED_SLOTS"],
  WEATHER_HOOK: ["FLASH_DEAL", "SEASONAL_PROMO", "BUNDLE"],
  ANNIVERSARY: ["SEASONAL_PROMO", "FLASH_DEAL", "BUNDLE"],
  WIN_BACK: ["FLASH_DEAL", "BUNDLE", "LIMITED_SLOTS"],
};

function pickOfferType(input: {
  opportunityType: OpportunityTypeLiteral;
  recommendedOfferTypes: OfferTypeLiteral[];
  enableStudentPromo: boolean;
}) {
  const preferred = input.recommendedOfferTypes.length > 0
    ? input.recommendedOfferTypes
    : OFFER_BY_OPPORTUNITY[input.opportunityType];

  for (const candidate of preferred) {
    if (candidate === "STUDENT_PROMO" && !input.enableStudentPromo) {
      continue;
    }
    return candidate;
  }

  return "FLASH_DEAL" as OfferTypeLiteral;
}

function normalizeCtaKeyword(value: string) {
  return value
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "GLOW";
}

export function generateOfferFromOpportunity(input: {
  opportunity: {
    type: OpportunityTypeLiteral;
    reason: string;
    recommended_offer_types: OfferTypeLiteral[];
    time_window_start: Date;
    time_window_end: Date;
    metadata: unknown;
  };
  business: {
    name: string;
    type: "SALON" | "SPA" | "CLINIC" | "BARBERSHOP";
    maxDiscountPercent: number;
    enableStudentPromo: boolean;
    avoidCheapWording: boolean;
  };
  services: ServiceLite[];
  constraints?: {
    maxDiscountPercent?: number;
  };
}): GeneratedOffer {
  const selectedServices = input.services.slice(0, 3);
  const avgPrice =
    selectedServices.reduce((sum, service) => sum + service.price, 0) /
    Math.max(1, selectedServices.length);
  const avgDuration =
    selectedServices.reduce((sum, service) => sum + (service.duration || 30), 0) /
    Math.max(1, selectedServices.length);

  const offerType = pickOfferType({
    opportunityType: input.opportunity.type,
    recommendedOfferTypes: input.opportunity.recommended_offer_types,
    enableStudentPromo: input.business.enableStudentPromo,
  });

  const hardDiscountCap = Math.max(
    1,
    Math.min(
      input.business.maxDiscountPercent,
      input.constraints?.maxDiscountPercent ?? input.business.maxDiscountPercent,
    ),
  );
  const baseDiscount = avgPrice > 1200 ? 10 : avgPrice > 700 ? 12 : 15;
  const discountPercent = Math.min(hardDiscountCap, baseDiscount);
  const limitedSlots = avgDuration >= 120 ? 6 : avgDuration >= 90 ? 8 : 10;

  const templatePool = getTemplatesForBusinessType(input.business.type);
  const template = templatePool.find((entry) => entry.offerType === offerType) || templatePool[0];

  const firstService = selectedServices[0]?.name || "selected services";
  const title = template
    ? template.headline
    : `${offerType.replaceAll("_", " ")} for ${firstService}`;
  const ctaKeyword = normalizeCtaKeyword(title);

  const riskFlags: string[] = [];
  const metadata = (input.opportunity.metadata || {}) as Record<string, unknown>;
  const openSlots = typeof metadata.openSlots === "number" ? metadata.openSlots : null;

  if (openSlots !== null && openSlots <= 2) {
    riskFlags.push("LOW_CAPACITY");
  }
  if (avgDuration >= 150) {
    riskFlags.push("LONG_DURATION_SERVICE");
  }
  if (discountPercent >= 18) {
    riskFlags.push("HIGH_DISCOUNT");
  }

  if (input.business.avoidCheapWording) {
    riskFlags.push("LUXURY_TONE_ENFORCED");
  }

  const terms = [
    `Valid from ${input.opportunity.time_window_start.toISOString()} to ${input.opportunity.time_window_end.toISOString()}`,
    `Limited to ${limitedSlots} booking slots.`,
    "Cannot be combined with other active promos.",
    "Final availability depends on confirmed booking slots.",
  ];

  return {
    title,
    offerType,
    mechanics: {
      discountPercent,
      bundleServiceIds: selectedServices.slice(0, 2).map((service) => service.id),
      limitedSlots,
      freebies: offerType === "BUNDLE" ? ["Free add-on consultation"] : [],
    },
    timeWindowStart: input.opportunity.time_window_start,
    timeWindowEnd: input.opportunity.time_window_end,
    terms,
    suggestedCtaKeyword: ctaKeyword || `BOOK${getCurrentDateTimePH().getDate()}`,
    riskFlags,
  };
}

