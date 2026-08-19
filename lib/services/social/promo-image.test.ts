import { describe, expect, it } from "vitest";

import { DiscountType } from "@/prisma/generated/prisma/enums";
import { SOCIAL_IMAGE_PROFILES } from "./image-profiles";
import {
  buildOrganicImagePrompt,
  buildSocialImagePrompt,
  validateCampaignPromptAlignment,
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
  it("enforces rainy opportunity and manicure alignment", () => {
    const creativeContext = {
      version: 1 as const, opportunityType: "WEATHER_HOOK" as const, opportunityReason: "Rainy conditions expected.", anchor: "RAINY_SEASON_COMFORT" as const,
      anchorLabel: "Rainy-season comfort", requiredContext: "Make rainy weather unmistakable.", campaignIntent: "DISCOUNT", audience: "Local clients",
      visualMood: "Visible rain outside and warm comfort inside.", visualSubject: "Manicure as hero", visualBrief: "Rainy-season manicure with visible rain and warm indoor comfort.",
      services: ["Regular manicure"], serviceCategories: ["NAILS"], packages: [], imageProfile: "SOFT_EDITORIAL", captionTone: "FRIENDLY_TAGLISH",
    };
    const input = { ...BASE_PROMO_INPUT, serviceNames: ["Regular manicure"], serviceCategories: ["NAILS"], creativeContext };
    const prompt = buildSocialImagePrompt(input);
    expect(prompt).toMatch(/REQUIRED OPPORTUNITY ANCHOR/i);
    expect(prompt).toMatch(/rain/i);
    expect(prompt).toMatch(/manicure/i);
    expect(validateCampaignPromptAlignment(input, prompt)).toEqual({ aligned: true, missing: [] });
  });

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

const FAKE_REFERENCE = { data: "QUJD", mimeType: "image/png" } as const;

describe("reference-image prompt injection", () => {
  it("adds strict identity-preservation rules for a PERSON reference", () => {
    const prompt = buildSocialImagePrompt({
      ...BASE_PROMO_INPUT,
      reference: { ...FAKE_REFERENCE, subject: "PERSON" },
    });

    expect(prompt).toContain("IDENTITY LOCK");
    expect(prompt).toContain("Recreate THIS EXACT SAME PERSON");
    expect(prompt).toContain("Do NOT beautify");
    // The person block must override the profile's "prefer no people" bias.
    expect(prompt).toContain(
      "IGNORE any earlier direction that prefers no people",
    );
    // The standing no-text / no-logo guardrails must remain intact.
    expect(prompt).toContain(
      "Absolutely NO text, letters, words, numbers, or symbols anywhere in the image.",
    );
    expect(prompt).toContain("NO logos");
  });

  it("uses style-only wording for a STYLE reference and omits the person block", () => {
    const prompt = buildOrganicImagePrompt({
      businessSlug: "beautyfeel",
      businessName: "BeautyFeel",
      topic: "Calm corner",
      category: "GENERAL",
      imageProfile: "SOFT_EDITORIAL",
      reference: { ...FAKE_REFERENCE, subject: "STYLE" },
    });

    expect(prompt).toContain("STYLE REFERENCE");
    expect(prompt).toContain("match its lighting, color palette");
    expect(prompt).not.toContain("IDENTITY LOCK");
    expect(prompt).not.toContain("Recreate THIS EXACT SAME PERSON");
  });

  it("treats a PRODUCT reference as a faithful object, not a person", () => {
    const prompt = buildSocialImagePrompt({
      ...BASE_PROMO_INPUT,
      reference: { ...FAKE_REFERENCE, subject: "PRODUCT" },
    });

    expect(prompt).toContain("PRODUCT REFERENCE");
    expect(prompt).toContain("Feature THIS product faithfully");
    expect(prompt).not.toContain("IDENTITY LOCK");
  });

  it("does not inject any reference block when no reference is attached", () => {
    const prompt = buildSocialImagePrompt({ ...BASE_PROMO_INPUT });
    expect(prompt).not.toContain("REFERENCE IMAGE PROVIDED");
  });
});
