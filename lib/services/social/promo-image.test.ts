import { describe, expect, it } from "vitest";

import { DiscountType } from "@/prisma/generated/prisma/enums";
import { SOCIAL_IMAGE_PROFILES } from "./image-profiles";
import { buildSocialImagePrompt } from "./promo-image";

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
    "builds a profile-scoped prompt for %s",
    (profile) => {
      const prompt = buildSocialImagePrompt({
        ...BASE_PROMO_INPUT,
        imageProfile: profile,
      });

      expect(prompt).toContain("Create a high-quality and visually distinct social media promo visual");
      expect(prompt).toContain(`Design profile: ${profile}.`);
      expect(prompt).toContain(BASE_PROMO_INPUT.businessName);
      expect(prompt).toContain(BASE_PROMO_INPUT.title);
      expect(prompt).toContain("15% OFF");
      expect(prompt).toContain("Hard constraints:");
      expect(prompt).toContain("No external logos, no watermarks, no trademarked brand marks.");
    },
  );
});
