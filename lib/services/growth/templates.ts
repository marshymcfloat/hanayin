import type { BusinessTypeLiteral, OfferTypeLiteral } from "@/lib/services/growth/types";

export interface GrowthTemplate {
  id: string;
  businessType: BusinessTypeLiteral;
  offerType: OfferTypeLiteral;
  headline: string;
  angle: string;
  overlay: string;
}

function createTemplates(
  businessType: BusinessTypeLiteral,
  seeds: Array<Omit<GrowthTemplate, "businessType">>,
): GrowthTemplate[] {
  return seeds.map((seed) => ({ ...seed, businessType }));
}

export const SALON_TEMPLATES = createTemplates("SALON", [
  { id: "salon-1", offerType: "FLASH_DEAL", headline: "2PM Glow Rescue", angle: "slow-hours-fill", overlay: "MIDDAY GLOW" },
  { id: "salon-2", offerType: "PAYDAY_PROMO", headline: "Payday Hair Reset", angle: "payday", overlay: "PAYDAY HAIR DAY" },
  { id: "salon-3", offerType: "LIMITED_SLOTS", headline: "Friday Blowout Rush", angle: "weekend-prep", overlay: "FRIDAY SLOTS" },
  { id: "salon-4", offerType: "BUNDLE", headline: "Color + Treatment Duo", angle: "bundle-value", overlay: "DUO SAVINGS" },
  { id: "salon-5", offerType: "SEASONAL_PROMO", headline: "Valentine Date-Ready Hair", angle: "seasonal", overlay: "DATE READY" },
  { id: "salon-6", offerType: "FLASH_DEAL", headline: "Rainy Day Hair Spa", angle: "weather-hook", overlay: "RAINY RESET" },
  { id: "salon-7", offerType: "LIMITED_SLOTS", headline: "After-Work Quick Glam", angle: "commute-hour", overlay: "AFTER WORK" },
  { id: "salon-8", offerType: "BUNDLE", headline: "Cut + Blowdry Combo", angle: "combo", overlay: "COMBO TODAY" },
  { id: "salon-9", offerType: "STUDENT_PROMO", headline: "Campus Glow Deal", angle: "student", overlay: "STUDENT GLOW" },
  { id: "salon-10", offerType: "SEASONAL_PROMO", headline: "Graduation Hair Ready", angle: "graduation", overlay: "GRAD READY" },
]);

export const SPA_TEMPLATES = createTemplates("SPA", [
  { id: "spa-1", offerType: "FLASH_DEAL", headline: "Quiet Hours Body Reset", angle: "slow-hours-fill", overlay: "SELF-CARE NOW" },
  { id: "spa-2", offerType: "PAYDAY_PROMO", headline: "Payday Relax Pass", angle: "payday", overlay: "PAYDAY RELAX" },
  { id: "spa-3", offerType: "LIMITED_SLOTS", headline: "Weekend Recovery Slots", angle: "weekend-prep", overlay: "LIMITED SLOTS" },
  { id: "spa-4", offerType: "BUNDLE", headline: "Massage + Scrub Pair", angle: "bundle-value", overlay: "PAIR OFFER" },
  { id: "spa-5", offerType: "SEASONAL_PROMO", headline: "Holiday Stress-Off Package", angle: "seasonal", overlay: "STRESS OFF" },
  { id: "spa-6", offerType: "FLASH_DEAL", headline: "Rainy Day Cozy Ritual", angle: "weather-hook", overlay: "COZY RITUAL" },
  { id: "spa-7", offerType: "LIMITED_SLOTS", headline: "Sunset Wind-Down Session", angle: "after-work", overlay: "SUNSET RESET" },
  { id: "spa-8", offerType: "BUNDLE", headline: "Facial + Back Relief", angle: "combo", overlay: "DOUBLE RESET" },
  { id: "spa-9", offerType: "STUDENT_PROMO", headline: "Student Calm Hour", angle: "student", overlay: "CALM HOUR" },
  { id: "spa-10", offerType: "SEASONAL_PROMO", headline: "Summer Cool-Down Ritual", angle: "seasonal", overlay: "COOL DOWN" },
]);

export const BARBERSHOP_TEMPLATES = createTemplates("BARBERSHOP", [
  { id: "barber-1", offerType: "FLASH_DEAL", headline: "2PM Fresh Fade Window", angle: "slow-hours-fill", overlay: "FRESH FADE" },
  { id: "barber-2", offerType: "PAYDAY_PROMO", headline: "Payday Groom Boost", angle: "payday", overlay: "PAYDAY FRESH" },
  { id: "barber-3", offerType: "LIMITED_SLOTS", headline: "Friday Cut Queue", angle: "weekend-prep", overlay: "FRIDAY CUTS" },
  { id: "barber-4", offerType: "BUNDLE", headline: "Cut + Beard Detail", angle: "bundle-value", overlay: "CUT + BEARD" },
  { id: "barber-5", offerType: "SEASONAL_PROMO", headline: "Holiday Sharp Look", angle: "seasonal", overlay: "SHARP LOOK" },
  { id: "barber-6", offerType: "FLASH_DEAL", headline: "Rainy Day Fresh-Up", angle: "weather-hook", overlay: "RAINY FRESH" },
  { id: "barber-7", offerType: "LIMITED_SLOTS", headline: "After-Office Quick Cut", angle: "after-work", overlay: "QUICK CUT" },
  { id: "barber-8", offerType: "BUNDLE", headline: "Fade + Hot Towel Combo", angle: "combo", overlay: "COMBO CUT" },
  { id: "barber-9", offerType: "STUDENT_PROMO", headline: "Student Trim Deal", angle: "student", overlay: "STUDENT TRIM" },
  { id: "barber-10", offerType: "SEASONAL_PROMO", headline: "Graduation Groom Plan", angle: "graduation", overlay: "GRAD GROOM" },
]);

export const CLINIC_TEMPLATES = createTemplates("CLINIC", [
  { id: "clinic-1", offerType: "FLASH_DEAL", headline: "Afternoon Skin Consult", angle: "slow-hours-fill", overlay: "SKIN CHECK" },
  { id: "clinic-2", offerType: "PAYDAY_PROMO", headline: "Payday Wellness Visit", angle: "payday", overlay: "PAYDAY WELLNESS" },
  { id: "clinic-3", offerType: "LIMITED_SLOTS", headline: "Weekend Prep Session", angle: "weekend-prep", overlay: "LIMITED CONSULTS" },
  { id: "clinic-4", offerType: "BUNDLE", headline: "Consult + Follow-Up Bundle", angle: "bundle-value", overlay: "BUNDLE CARE" },
  { id: "clinic-5", offerType: "SEASONAL_PROMO", headline: "Holiday Skin Readiness", angle: "seasonal", overlay: "SEASON READY" },
  { id: "clinic-6", offerType: "FLASH_DEAL", headline: "Rainy Day Skin Care", angle: "weather-hook", overlay: "RAINY CARE" },
  { id: "clinic-7", offerType: "LIMITED_SLOTS", headline: "Evening Check-Up Window", angle: "after-work", overlay: "EVENING SLOT" },
  { id: "clinic-8", offerType: "BUNDLE", headline: "Assessment + Plan Session", angle: "combo", overlay: "PLAN SESSION" },
  { id: "clinic-9", offerType: "STUDENT_PROMO", headline: "Student Skin Review", angle: "student", overlay: "STUDENT CARE" },
  { id: "clinic-10", offerType: "SEASONAL_PROMO", headline: "Summer Skin Defense", angle: "seasonal", overlay: "SUMMER DEFENSE" },
]);

export const GROWTH_TEMPLATES: GrowthTemplate[] = [
  ...SALON_TEMPLATES,
  ...SPA_TEMPLATES,
  ...BARBERSHOP_TEMPLATES,
  ...CLINIC_TEMPLATES,
];

export function getTemplatesForBusinessType(businessType: BusinessTypeLiteral) {
  return GROWTH_TEMPLATES.filter((template) => template.businessType === businessType);
}

