import { describe, expect, it } from "vitest";

import {
  pickCampaignStyling,
  recommendCampaignStyling,
} from "./styling-recommender";

describe("recommendCampaignStyling", () => {
  it("biases PAYDAY_SPIKE opportunities to direct/urgent voice", () => {
    const r = recommendCampaignStyling({
      opportunityType: "PAYDAY_SPIKE",
      serviceCategories: ["FACIAL"],
    });
    expect(r.captionTone).toBe("DIRECT_URGENT");
    expect(r.imageProfile).toBe("WARM_EDITORIAL");
    expect(r.rationale).toContain("payday spike");
  });

  it("biases ANNIVERSARY opportunities to premium voice", () => {
    const r = recommendCampaignStyling({
      opportunityType: "ANNIVERSARY",
      serviceCategories: ["MASSAGE"],
    });
    expect(r.captionTone).toBe("PREMIUM_LUXURY");
    expect(r.imageProfile).toBe("SOFT_EDITORIAL");
  });

  it("falls back to general defaults when no service info is given", () => {
    const r = recommendCampaignStyling({ opportunityType: "WIN_BACK" });
    expect(r.captionTone).toBe("WARM_NURTURING");
    expect(r.rationale).toContain("general");
  });
});

describe("pickCampaignStyling (Wave I4)", () => {
  it("uses offer-brief tone and profile when no override is provided", () => {
    const r = pickCampaignStyling({
      offer: {
        offerType: "FLASH_DEAL",
        publicDescription: "20% off facial deep cleanse — today only",
      },
    });
    // FLASH_DEAL maps to DIRECT_URGENT + BOLD_MONOCHROME in the brief.
    expect(r.captionTone).toBe("DIRECT_URGENT");
    expect(r.imageProfile).toBe("BOLD_MONOCHROME");
    expect(r.ownerOverrodeCaptionTone).toBe(false);
    expect(r.ownerOverrodeImageProfile).toBe(false);
  });

  it("respects owner caption-tone override", () => {
    const r = pickCampaignStyling({
      offer: {
        offerType: "FLASH_DEAL",
        publicDescription: "Big sale today",
      },
      override: { captionTone: "WARM_NURTURING" },
    });
    expect(r.captionTone).toBe("WARM_NURTURING");
    expect(r.ownerOverrodeCaptionTone).toBe(true);
    // image profile still inferred from offer type
    expect(r.imageProfile).toBe("BOLD_MONOCHROME");
    expect(r.ownerOverrodeImageProfile).toBe(false);
  });

  it("treats AUTO and null as no caption-tone override", () => {
    const auto = pickCampaignStyling({
      offer: { offerType: "BUNDLE", publicDescription: "2-for-1 bundle" },
      override: { captionTone: "AUTO" },
    });
    const nullOv = pickCampaignStyling({
      offer: { offerType: "BUNDLE", publicDescription: "2-for-1 bundle" },
      override: { captionTone: null },
    });
    expect(auto.ownerOverrodeCaptionTone).toBe(false);
    expect(nullOv.ownerOverrodeCaptionTone).toBe(false);
    // BUNDLE → FRIENDLY_TAGLISH
    expect(auto.captionTone).toBe("FRIENDLY_TAGLISH");
    expect(nullOv.captionTone).toBe("FRIENDLY_TAGLISH");
  });

  it("respects owner image-profile override when valid", () => {
    const r = pickCampaignStyling({
      offer: {
        offerType: "FLASH_DEAL",
        publicDescription: "Flash deal",
      },
      override: { imageProfile: "PHOTO_REALISTIC" },
    });
    expect(r.imageProfile).toBe("PHOTO_REALISTIC");
    expect(r.ownerOverrodeImageProfile).toBe(true);
  });

  it("ignores invalid image-profile strings and falls back to brief", () => {
    const r = pickCampaignStyling({
      offer: {
        offerType: "LOYALTY_REWARD",
        publicDescription: "Thank-you reward for our regulars",
      },
      override: { imageProfile: "GIBBERISH_NOT_A_PROFILE" },
    });
    expect(r.imageProfile).toBe("SOFT_EDITORIAL"); // LOYALTY_REWARD brief
    expect(r.ownerOverrodeImageProfile).toBe(false);
  });

  it("applies medical-procedural topic refinement to override imageProfile to MODERN_GRAPHIC", () => {
    const r = pickCampaignStyling({
      offer: {
        offerType: "FLASH_DEAL",
        publicDescription: "Flash deal on laser hair removal",
      },
    });
    expect(r.imageProfile).toBe("MODERN_GRAPHIC");
    expect(r.rationale).toContain("Clinical");
  });

  it("applies transformation topic refinement to PHOTO_REALISTIC", () => {
    const r = pickCampaignStyling({
      offer: {
        offerType: "BUNDLE",
        publicDescription: "Hair transformation before / after bundle",
      },
    });
    expect(r.imageProfile).toBe("PHOTO_REALISTIC");
    expect(r.captionTone).toBe("FRIENDLY_TAGLISH"); // BUNDLE base tone
  });

  it("returns rationale string from the brief for telemetry/UI use", () => {
    const r = pickCampaignStyling({
      offer: {
        offerType: "SEASONAL_PROMO",
        publicDescription: "Holiday gift package",
      },
    });
    expect(r.rationale).toBeTruthy();
    expect(r.rationale.length).toBeGreaterThan(10);
  });

  it("exposes inferredCaptionTone/inferredImageProfile for telemetry (Wave J5)", () => {
    const r = pickCampaignStyling({
      offer: {
        offerType: "BUNDLE",
        publicDescription: "2-for-1 lash bundle",
      },
      override: {
        captionTone: "PREMIUM_LUXURY",
        imageProfile: "SOFT_EDITORIAL",
      },
    });
    // Final values reflect the override
    expect(r.captionTone).toBe("PREMIUM_LUXURY");
    expect(r.imageProfile).toBe("SOFT_EDITORIAL");
    // Inferred values are the brief's untouched picks for BUNDLE
    expect(r.inferredCaptionTone).toBe("FRIENDLY_TAGLISH");
    expect(r.inferredImageProfile).toBe("MODERN_GRAPHIC");
    expect(r.ownerOverrodeCaptionTone).toBe(true);
    expect(r.ownerOverrodeImageProfile).toBe(true);
  });
});
