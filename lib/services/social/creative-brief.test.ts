import { describe, expect, it } from "vitest";

import {
  inferCreativeBrief,
  inferCreativeBriefForOffer,
} from "@/lib/services/social/creative-brief";
import type { OrganicPostCategory } from "@/lib/services/social/caption-generator";

describe("inferCreativeBrief — organic categories", () => {
  it.each<[OrganicPostCategory, string]>([
    ["TIPS_EDUCATION", "FRIENDLY_TAGLISH"],
    ["BEHIND_THE_SCENES", "WARM_NURTURING"],
    ["SEASONAL_GREETING", "WARM_NURTURING"],
    ["TEAM_SPOTLIGHT", "WARM_NURTURING"],
    ["SERVICE_SHOWCASE", "PREMIUM_LUXURY"],
    ["GENERAL", "FRIENDLY_TAGLISH"],
  ])("%s gets the expected default tone (%s)", (category, expected) => {
    const brief = inferCreativeBrief({
      category,
      topic: "general topic",
    });
    expect(brief.captionTone).toBe(expected);
  });

  it("provides a non-empty rationale for every category", () => {
    const categories: OrganicPostCategory[] = [
      "TIPS_EDUCATION",
      "BEHIND_THE_SCENES",
      "SEASONAL_GREETING",
      "TEAM_SPOTLIGHT",
      "SERVICE_SHOWCASE",
      "GENERAL",
    ];
    for (const category of categories) {
      const brief = inferCreativeBrief({ category, topic: "x" });
      expect(brief.rationale.length).toBeGreaterThan(10);
    }
  });

  it("TIPS_EDUCATION uses EDUCATIONAL profile by default (Wave I2)", () => {
    const brief = inferCreativeBrief({
      category: "TIPS_EDUCATION",
      topic: "skincare habits",
    });
    expect(brief.imageProfile).toBe("EDUCATIONAL");
    expect(brief.rationale.toLowerCase()).toContain("tip");
  });

  it("medical/procedural topics under TIPS_EDUCATION stay on EDUCATIONAL", () => {
    // Wave-update: the medical/procedural → MODERN_GRAPHIC tilt only
    // applies to SERVICE_SHOWCASE now. TIPS_EDUCATION must keep
    // EDUCATIONAL because the post-image pipeline only renders the
    // tip-card headline + bullet overlay when imageProfile is
    // EDUCATIONAL. Switching to MODERN_GRAPHIC would silently drop
    // all overlay text and ship a bare photograph.
    const brief = inferCreativeBrief({
      category: "TIPS_EDUCATION",
      topic: "lipo suction",
    });
    expect(brief.imageProfile).toBe("EDUCATIONAL");
  });

  it("biases medical/procedural topics under SERVICE_SHOWCASE toward MODERN_GRAPHIC", () => {
    const brief = inferCreativeBrief({
      category: "SERVICE_SHOWCASE",
      topic: "lipo suction",
    });
    expect(brief.imageProfile).toBe("MODERN_GRAPHIC");
    expect(brief.rationale).toMatch(/clinical|graphic|procedural/i);
  });

  it("biases transformation topics toward PHOTO_REALISTIC", () => {
    const brief = inferCreativeBrief({
      category: "SERVICE_SHOWCASE",
      topic: "before and after our signature facial",
    });
    expect(brief.imageProfile).toBe("PHOTO_REALISTIC");
  });

  it("barbershop service showcase tilts to BOLD_MONOCHROME + WITTY_PLAYFUL", () => {
    const brief = inferCreativeBrief({
      category: "SERVICE_SHOWCASE",
      topic: "fresh fade",
      businessType: "BARBERSHOP",
    });
    expect(brief.imageProfile).toBe("BOLD_MONOCHROME");
    expect(brief.captionTone).toBe("WITTY_PLAYFUL");
  });

  it("clinic TIPS_EDUCATION posts stay on EDUCATIONAL so the overlay renders", () => {
    // Wave-update: previously CLINIC business type tilted TIPS_EDUCATION
    // toward MODERN_GRAPHIC. That broke the educational overlay (only
    // renders when imageProfile === "EDUCATIONAL"), shipping bare
    // photographs for clinic tip posts. The CLINIC tilt now leaves
    // TIPS_EDUCATION untouched.
    const brief = inferCreativeBrief({
      category: "TIPS_EDUCATION",
      topic: "skincare habits",
      businessType: "CLINIC",
    });
    expect(brief.imageProfile).toBe("EDUCATIONAL");
  });
});

describe("inferCreativeBriefForOffer — growth-engine sale posts", () => {
  it("FLASH_DEAL gets BOLD_MONOCHROME + DIRECT_URGENT", () => {
    const brief = inferCreativeBriefForOffer({
      offerType: "FLASH_DEAL",
      topic: "Mid-Week Glow Treat",
    });
    expect(brief.imageProfile).toBe("BOLD_MONOCHROME");
    expect(brief.captionTone).toBe("DIRECT_URGENT");
  });

  it("SOCIAL_REMINDER gets WARM_EDITORIAL + FRIENDLY_TAGLISH", () => {
    const brief = inferCreativeBriefForOffer({
      offerType: "SOCIAL_REMINDER",
      topic: "Weekend Glow Slots",
    });
    expect(brief.imageProfile).toBe("WARM_EDITORIAL");
    expect(brief.captionTone).toBe("FRIENDLY_TAGLISH");
  });

  it("LOYALTY_REWARD gets SOFT_EDITORIAL + WARM_NURTURING", () => {
    const brief = inferCreativeBriefForOffer({
      offerType: "LOYALTY_REWARD",
      topic: "Loyalty Appreciation",
    });
    expect(brief.imageProfile).toBe("SOFT_EDITORIAL");
    expect(brief.captionTone).toBe("WARM_NURTURING");
  });

  it("THEMED_PACKAGE gets WARM_EDITORIAL + PREMIUM_LUXURY", () => {
    const brief = inferCreativeBriefForOffer({
      offerType: "THEMED_PACKAGE",
      topic: "Holiday Stress-Off Package",
    });
    expect(brief.imageProfile).toBe("WARM_EDITORIAL");
    expect(brief.captionTone).toBe("PREMIUM_LUXURY");
  });

  it("medical-procedural topic overrides to MODERN_GRAPHIC even for promos", () => {
    const brief = inferCreativeBriefForOffer({
      offerType: "BUNDLE",
      topic: "lipo suction package",
    });
    expect(brief.imageProfile).toBe("MODERN_GRAPHIC");
  });

  it("transformation topic overrides to PHOTO_REALISTIC even for promos", () => {
    const brief = inferCreativeBriefForOffer({
      offerType: "FLASH_DEAL",
      topic: "before and after slimming sessions",
    });
    expect(brief.imageProfile).toBe("PHOTO_REALISTIC");
  });
});
