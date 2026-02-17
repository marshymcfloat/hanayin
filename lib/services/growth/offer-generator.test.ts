import { describe, expect, it } from "vitest";

import { generateOfferFromOpportunity } from "@/lib/services/growth/offer-generator";

function buildBaseInput() {
  return {
    opportunity: {
      type: "HOLIDAY_SEASONAL" as const,
      reason: "Graduation season demand window detected.",
      recommended_offer_types: ["STUDENT_PROMO", "BUNDLE"] as const,
      time_window_start: new Date("2026-03-10T10:00:00+08:00"),
      time_window_end: new Date("2026-03-10T20:00:00+08:00"),
      metadata: {},
    },
    business: {
      name: "Glow Studio",
      type: "SPA" as const,
      maxDiscountPercent: 20,
      enableStudentPromo: true,
      avoidCheapWording: false,
    },
    services: [
      { id: 1, name: "Facial", price: 600, duration: 60 },
      { id: 2, name: "Massage", price: 800, duration: 90 },
    ],
  };
}

describe("generateOfferFromOpportunity", () => {
  it("uses STUDENT_PROMO when enabled and recommended", () => {
    const input = buildBaseInput();

    const offer = generateOfferFromOpportunity(input);

    expect(offer.offerType).toBe("STUDENT_PROMO");
    expect(offer.title).toBe("Student Calm Hour");
  });

  it("skips STUDENT_PROMO when disabled and uses the next recommended type", () => {
    const input = buildBaseInput();
    input.business.enableStudentPromo = false;

    const offer = generateOfferFromOpportunity(input);

    expect(offer.offerType).toBe("BUNDLE");
    expect(offer.title).toBe("Massage + Scrub Pair");
  });

  it("enforces discount cap from business settings", () => {
    const input = buildBaseInput();
    input.business.maxDiscountPercent = 10;

    const offer = generateOfferFromOpportunity(input);

    expect(offer.mechanics.discountPercent).toBe(10);
  });
});
