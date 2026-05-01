import { getCurrentDateTimePH } from "@/lib/date-utils";
import { getTemplatesForBusinessType } from "@/lib/services/growth/templates";
import type {
  ActionCategory,
  GeneratedOffer,
  OfferTypeLiteral,
  OpportunityTypeLiteral,
} from "@/lib/services/growth/types";
import { getActionCategory } from "@/lib/services/growth/types";

type ServiceLite = {
  id: number;
  name: string;
  price: number;
  duration: number | null;
  category?: string | null;
};

// ─── Category-aware title generation ────────────────────────────────────────
//
// Templates produce business-type-level titles like "Mid-Week Body Reset" for
// any spa, but a spa selling eyelash extensions shouldn't get a "Body Reset"
// headline. When we can detect a dominant service category from the selected
// services or their explicit category labels, we synthesize a more specific
// headline using TITLE_NOUN_BY_CATEGORY. Falls back to the template headline
// when no clear category dominates.

type TitleCategoryKey =
  | "EYELASH"
  | "BROW"
  | "NAILS"
  | "SKIN"
  | "FACIAL"
  | "MASSAGE"
  | "SPA"
  | "HAIR"
  | "MAKEUP"
  | "BODY"
  | "WAXING";

const TITLE_NOUN_BY_CATEGORY: Record<TitleCategoryKey, string> = {
  EYELASH: "Lash",
  BROW: "Brow",
  NAILS: "Mani",
  SKIN: "Glow",
  FACIAL: "Facial",
  MASSAGE: "Massage",
  SPA: "Spa",
  HAIR: "Hair",
  MAKEUP: "Glam",
  BODY: "Body",
  WAXING: "Smooth",
};

const TITLE_CATEGORY_ALIAS: Record<string, TitleCategoryKey> = {
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
  GLAM: "MAKEUP",
  BODY: "BODY",
  WAXING: "WAXING",
  WAX: "WAXING",
};

function inferDominantCategory(services: ServiceLite[]): TitleCategoryKey | null {
  if (services.length === 0) return null;
  const haystack = services
    .flatMap((s) => [s.category ?? "", s.name])
    .map((value) => value.toUpperCase())
    .join(" ");
  if (!haystack.trim()) return null;

  const scores = new Map<TitleCategoryKey, number>();
  for (const [alias, key] of Object.entries(TITLE_CATEGORY_ALIAS)) {
    const re = new RegExp(`\\b${alias}\\b`);
    if (re.test(haystack)) {
      scores.set(key, (scores.get(key) ?? 0) + 1);
    }
  }

  let bestKey: TitleCategoryKey | null = null;
  let bestScore = 0;
  for (const [key, score] of scores) {
    if (score > bestScore) {
      bestKey = key;
      bestScore = score;
    }
  }
  return bestKey;
}

/**
 * Build a category-aware title from the template's "angle" (slow-hours-fill,
 * payday, weekend-prep, etc.) and the selected services. Returns null when
 * no category matches — caller should fall back to the template headline.
 */
function buildCategoryAwareDiscountTitle(
  angle: string,
  services: ServiceLite[],
): string | null {
  const category = inferDominantCategory(services);
  if (!category) return null;
  const noun = TITLE_NOUN_BY_CATEGORY[category];

  switch (angle) {
    case "slow-hours-fill":
      return `Mid-Week ${noun} Reset`;
    case "payday":
      return `Payday ${noun} Treat`;
    case "weekend-prep":
      return `Weekend ${noun} Slots`;
    case "weather-hook":
      return `Cozy ${noun} Hour`;
    case "after-work":
    case "commute-hour":
      return `After-Work ${noun} Quick-Pick`;
    case "bundle-value":
    case "combo":
      return `${noun} Combo Deal`;
    case "seasonal":
      return `Seasonal ${noun} Pick`;
    case "graduation":
      return `Grad-Ready ${noun}`;
    case "student":
      return `Student ${noun} Deal`;
    default:
      return null;
  }
}

/**
 * Same idea but for SOCIAL_REMINDER (no-discount) titles. Substitutes the
 * category noun into the active-voice headlines.
 */
function buildCategoryAwareReminderTitle(
  opportunityType: OpportunityTypeLiteral,
  weatherCondition: string | null,
  services: ServiceLite[],
): string | null {
  const category = inferDominantCategory(services);
  if (!category) return null;
  const noun = TITLE_NOUN_BY_CATEGORY[category];

  if (opportunityType === "PAYDAY_SPIKE") return `Payday ${noun} Picks`;
  if (opportunityType === "WEEKEND_PREP") return `Weekend ${noun} Slots Open`;
  if (weatherCondition === "HOT") return `Cool-Down ${noun} Session`;
  if (weatherCondition === "RAINY") return `Rainy-Day ${noun} Drop`;
  return `This Week's ${noun} Slots`;
}

const OFFER_BY_OPPORTUNITY: Record<OpportunityTypeLiteral, OfferTypeLiteral[]> = {
  SLOW_HOURS: ["FLASH_DEAL", "LIMITED_SLOTS"],
  PAYDAY_SPIKE: ["SOCIAL_REMINDER"],
  WEEKEND_PREP: ["SOCIAL_REMINDER", "CONTENT_POST"],
  HOLIDAY_SEASONAL: ["THEMED_PACKAGE", "CONTENT_POST"],
  WEATHER_HOOK: ["FLASH_DEAL", "SOCIAL_REMINDER"],
  ANNIVERSARY: ["LOYALTY_REWARD", "THEMED_PACKAGE"],
  WIN_BACK: ["SOCIAL_REMINDER", "CONTENT_POST"],
};

function pickOfferType(input: {
  opportunityType: OpportunityTypeLiteral;
  recommendedOfferTypes: readonly OfferTypeLiteral[];
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

  return "SOCIAL_REMINDER" as OfferTypeLiteral;
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

export function buildPublicSaleDescription(input: {
  offer: { title: string; offerType: OfferTypeLiteral; mechanics: GeneratedOffer["mechanics"] };
  serviceNames: string[];
  packageNames: string[];
}): string {
  const actionCategory = getActionCategory(input.offer.offerType);
  const items = [...input.serviceNames, ...input.packageNames].slice(0, 4);
  const itemsLine = items.length > 0 ? ` on ${items.join(", ")}` : "";

  if (actionCategory === "DISCOUNT") {
    const discount = input.offer.mechanics.discountPercent
      ? `${input.offer.mechanics.discountPercent}% off`
      : "special pricing";
    return `Enjoy ${discount}${itemsLine}. Limited to ${input.offer.mechanics.limitedSlots} booking slots.`;
  }

  if (input.offer.offerType === "THEMED_PACKAGE") {
    return input.offer.mechanics.themeTitle
      ? `${input.offer.mechanics.themeTitle} — a curated self-care experience${itemsLine}.`
      : `Treat yourself to a curated self-care experience${itemsLine}.`;
  }

  if (input.offer.offerType === "LOYALTY_REWARD") {
    return input.offer.mechanics.rewardDescription
      || `A special thank-you for our loyal clients${itemsLine}.`;
  }

  if (input.offer.offerType === "SOCIAL_REMINDER") {
    return input.offer.mechanics.messagingAngle
      || `Book your preferred schedule now${itemsLine}.`;
  }

  if (input.offer.offerType === "CONTENT_POST") {
    return input.offer.mechanics.contentTopic
      || `See what makes our services special${itemsLine}.`;
  }

  return `Check out our latest services${itemsLine}.`;
}

type OfferGeneratorInput = {
  opportunity: {
    type: OpportunityTypeLiteral;
    reason: string;
    recommended_offer_types: readonly OfferTypeLiteral[];
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
};

export function generateOfferFromOpportunity(input: OfferGeneratorInput): GeneratedOffer {
  const offerType = pickOfferType({
    opportunityType: input.opportunity.type,
    recommendedOfferTypes: input.opportunity.recommended_offer_types,
    enableStudentPromo: input.business.enableStudentPromo,
  });

  const actionCategory = getActionCategory(offerType);

  if (actionCategory === "DISCOUNT") {
    return generateDiscountOffer(input, offerType);
  }

  return generateNonDiscountOffer(input, offerType, actionCategory);
}

function generateDiscountOffer(
  input: OfferGeneratorInput,
  offerType: OfferTypeLiteral,
): GeneratedOffer {
  const selectedServices = input.services.slice(0, 3);
  const avgPrice =
    selectedServices.reduce((sum, service) => sum + service.price, 0) /
    Math.max(1, selectedServices.length);
  const avgDuration =
    selectedServices.reduce((sum, service) => sum + (service.duration || 30), 0) /
    Math.max(1, selectedServices.length);

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
  // Prefer a category-specific headline (e.g. "Mid-Week Lash Reset" instead of
  // the generic "Mid-Week Body Reset") when the selected services cluster
  // around a specific category.
  const categoryAwareTitle = template
    ? buildCategoryAwareDiscountTitle(template.angle, selectedServices)
    : null;
  const title =
    categoryAwareTitle ??
    (template
      ? template.headline
      : `${offerType.replaceAll("_", " ")} for ${firstService}`);
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

  const mechanics = {
    discountPercent,
    bundleServiceIds: selectedServices.slice(0, 2).map((service) => service.id),
    limitedSlots,
    freebies: offerType === "BUNDLE" ? ["Free add-on consultation"] : [],
  };

  const publicDescription = buildPublicSaleDescription({
    offer: { title, offerType, mechanics },
    serviceNames: selectedServices.map((service) => service.name),
    packageNames: [],
  });

  return {
    title,
    publicDescription,
    offerType,
    actionCategory: "DISCOUNT",
    mechanics,
    timeWindowStart: input.opportunity.time_window_start,
    timeWindowEnd: input.opportunity.time_window_end,
    terms,
    suggestedCtaKeyword: ctaKeyword || `BOOK${getCurrentDateTimePH().getDate()}`,
    riskFlags,
  };
}

function generateNonDiscountOffer(
  input: OfferGeneratorInput,
  offerType: OfferTypeLiteral,
  actionCategory: ActionCategory,
): GeneratedOffer {
  const metadata = (input.opportunity.metadata || {}) as Record<string, unknown>;
  const seasonalName = typeof metadata.seasonalSignalName === "string"
    ? metadata.seasonalSignalName
    : null;
  const weatherCondition = typeof metadata.weatherCondition === "string"
    ? metadata.weatherCondition
    : null;

  const serviceNames = input.services.slice(0, 3).map((s) => s.name);
  let title: string;
  let mechanics: GeneratedOffer["mechanics"] = {};
  let ctaKeyword: string;
  let terms: string[];

  switch (offerType) {
    case "THEMED_PACKAGE": {
      const theme = seasonalName || "Self-Care Special";
      title = `${theme} Package`;
      mechanics = {
        themeTitle: title,
        bundleServiceIds: input.services.slice(0, 3).map((s) => s.id),
      };
      ctaKeyword = normalizeCtaKeyword(theme);
      terms = [
        `Available during ${seasonalName || "this season"}.`,
        "Book any of the featured services at regular price.",
        "Curated experience — not a discount, but a themed collection.",
      ];
      break;
    }

    case "SOCIAL_REMINDER": {
      // Titles read as headlines on the social image, so they should be
      // active and inviting — not "Reminder" (which feels passive and was
      // also clashing with the urgency-styled image badge). Pair each
      // headline with a complementary messaging angle for the caption body.
      const angle = input.opportunity.type === "PAYDAY_SPIKE"
        ? "Payday treat day — pick a slot you actually want before they fill up."
        : input.opportunity.type === "WEEKEND_PREP"
          ? "Get weekend-ready without the rush — claim your preferred time now."
          : weatherCondition
            ? `${weatherCondition === "HOT" ? "Beat the heat" : "Cozy weather"} — perfect window for some self-care.`
            : "Open slots this week — book ahead and skip the wait.";
      // Try a category-aware headline first so a reminder for eyelash services
      // says "Weekend Lash Slots Open" rather than the generic "Weekend Glow
      // Slots Open". Falls back to the previous generic strings.
      const reminderServices = input.services.slice(0, 3);
      const categoryAwareReminderTitle = buildCategoryAwareReminderTitle(
        input.opportunity.type,
        weatherCondition,
        reminderServices,
      );
      title =
        categoryAwareReminderTitle ??
        (input.opportunity.type === "PAYDAY_SPIKE"
          ? "Payday Pamper Picks"
          : input.opportunity.type === "WEEKEND_PREP"
            ? "Weekend Glow Slots Open"
            : weatherCondition === "HOT"
              ? "Cool-Down Self-Care"
              : weatherCondition === "RAINY"
                ? "Rainy-Day Pamper Drop"
                : "This Week's Open Slots");
      mechanics = { messagingAngle: angle };
      ctaKeyword = "BOOK";
      terms = ["No discount — this is a booking reminder post.", "Encourage customers to book at regular price."];
      break;
    }

    case "CONTENT_POST": {
      const topic = seasonalName
        ? `Share a ${seasonalName}-themed tip or transformation photo.`
        : input.opportunity.type === "WEEKEND_PREP"
          ? "Share a weekend self-care tip or behind-the-scenes content."
          : "Share a client transformation, tip, or behind-the-scenes look.";
      title = seasonalName
        ? `${seasonalName} Content`
        : "Engagement Content";
      mechanics = { contentTopic: topic };
      ctaKeyword = "FOLLOW";
      terms = ["No discount or sale — this is an engagement/awareness post.", "Focus on building trust and visibility."];
      break;
    }

    case "LOYALTY_REWARD": {
      const reward = "Complimentary add-on service for returning clients this week.";
      title = "Loyalty Appreciation";
      mechanics = { rewardDescription: reward };
      ctaKeyword = "REBOOK";
      terms = [
        "Reward is for returning clients only.",
        "No public discount — this is a loyalty gesture.",
        "Encourage rebooking and word-of-mouth.",
      ];
      break;
    }

    default: {
      title = "Growth Post";
      mechanics = { messagingAngle: "Book your next session today." };
      ctaKeyword = "BOOK";
      terms = [];
    }
  }

  const publicDescription = buildPublicSaleDescription({
    offer: { title, offerType, mechanics },
    serviceNames,
    packageNames: [],
  });

  return {
    title,
    publicDescription,
    offerType,
    actionCategory,
    mechanics,
    timeWindowStart: input.opportunity.time_window_start,
    timeWindowEnd: input.opportunity.time_window_end,
    terms,
    suggestedCtaKeyword: ctaKeyword || `BOOK${getCurrentDateTimePH().getDate()}`,
    riskFlags: input.business.avoidCheapWording ? ["LUXURY_TONE_ENFORCED"] : [],
  };
}
