import { describe, expect, it } from "vitest";

import { DiscountType } from "@/prisma/generated/prisma/enums";
import { SOCIAL_IMAGE_PROFILES } from "./image-profiles";
import {
  buildOrganicImagePrompt,
  buildSocialImagePrompt,
} from "./promo-image";

const BASE_PROMO_INPUT = {
  businessSlug: "beautyfeel",
  businessName: "BeautyFeel",
  title: "Quiet Hours Body Reset",
  saleDescription: "Limited slots this week",
  captionText: "Refresh your week with calm self-care.",
  discountType: DiscountType.PERCENTAGE,
  discountValue: 15,
  startDate: new Date("2026-02-23T00:00:00.000Z"),
  endDate: new Date("2026-02-25T00:00:00.000Z"),
  serviceNames: ["Manicure Gel", "Swedish Massage"],
  serviceCategories: ["Hands", "Massage"],
  packageNames: ["Glow Bundle"],
};

describe("promo-image prompt builder", () => {
  it.each(SOCIAL_IMAGE_PROFILES)(
    "produces a photography-only prompt for %s and forbids embedded text",
    (profile) => {
      const prompt = buildSocialImagePrompt({
        ...BASE_PROMO_INPUT,
        imageProfile: profile,
      });

      expect(prompt).toContain(`DESIGN PROFILE: ${profile}`);
      expect(prompt).toContain("THIS IS A PHOTOGRAPH");
      expect(prompt).toContain(
        "Absolutely NO text, letters, words, numbers, or symbols anywhere in the image.",
      );
      expect(prompt).toContain(BASE_PROMO_INPUT.businessName);
      expect(prompt).toContain(BASE_PROMO_INPUT.title);
      // The discount must NOT be rendered into the image — it stays in caption.
      expect(prompt).toContain(
        "DO NOT render this number in the image",
      );
    },
  );

  it("respects owner-supplied direction when provided", () => {
    const prompt = buildSocialImagePrompt({
      ...BASE_PROMO_INPUT,
      ownerImageDirection: "soft autumn tones, woman in her 30s",
    });

    expect(prompt).toContain(
      "soft autumn tones, woman in her 30s",
    );
  });
});

describe("organic image prompt builder", () => {
  it("emits a pure photography brief with no in-image text", () => {
    const prompt = buildOrganicImagePrompt({
      businessSlug: "beautyfeel",
      businessName: "BeautyFeel",
      topic: "Glow Routine for Rainy Season",
      category: "TIPS_EDUCATION",
      captionText: "Pro tip: layer your serums.",
      imageProfile: "SOFT_EDITORIAL",
    });

    expect(prompt).toContain("THIS IS A PHOTOGRAPH");
    expect(prompt).toContain("BeautyFeel");
    expect(prompt).toContain(
      "Absolutely NO text, letters, words, numbers, or symbols anywhere in the image.",
    );
    expect(prompt).toContain("Glow Routine for Rainy Season");
  });
});
