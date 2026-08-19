import { describe, expect, it } from "vitest";
import { buildCampaignCreativeContext, parseCampaignCreativeContext } from "./creative-context";

const offer = {
  title: "Mid-Week Mani Reset", publicDescription: "15% off selected services.", offerType: "FLASH_DEAL" as const,
  actionCategory: "DISCOUNT" as const, mechanics: { discountPercent: 15 }, timeWindowStart: new Date("2026-08-19T02:00:00Z"),
  timeWindowEnd: new Date("2026-08-19T12:00:00Z"), terms: [], suggestedCtaKeyword: "BOOK", riskFlags: [],
};

describe("campaign creative context", () => {
  it("turns rainy weather into a required service-aware anchor", () => {
    const context = buildCampaignCreativeContext({
      opportunity: { type: "WEATHER_HOOK", reason: "Rainy conditions expected.", metadata: { weatherCondition: "RAINY", precipitationProbability: 88 } },
      offer, serviceNames: ["Regular manicure", "Foot spa"], serviceCategories: ["NAILS", "SPA"], packageNames: [], imageProfile: "SOFT_EDITORIAL", captionTone: "FRIENDLY_TAGLISH",
    });
    expect(context.anchor).toBe("RAINY_SEASON_COMFORT");
    expect(context.visualBrief).toMatch(/rainy weather/i);
    expect(context.visualBrief).toMatch(/Regular manicure, Foot spa/i);
    expect(parseCampaignCreativeContext({ creativeContext: context })).toEqual(context);
  });
});
