import { describe, expect, it } from "vitest";

import {
  generateOrganicCaptionDraft,
  type OrganicPostCategory,
} from "@/lib/services/social/caption-generator";

/**
 * Wave I1 — Footer policy is category-aware.
 *
 * Before this wave, every caption (organic or sale) had
 * `Book now through ServiceFlow and claim your spot today.`
 * appended by `enforceServiceFlowEnding`. That meant educational,
 * seasonal, behind-the-scenes, and team-spotlight posts ended with
 * a hard booking CTA that contradicted their own body copy.
 *
 * The fix selects a soft engagement CTA for every non-promotional
 * category and keeps the booking CTA only for SERVICE_SHOWCASE
 * (and for sale-event flows that don't pass postCategory at all).
 *
 * These tests run with GEMINI_KEY unset in the test env, so
 * `generateOrganicCaptionDraft` returns the rescue path, which goes
 * through `finalizeCaptionOutput` → `enforceServiceFlowEnding` →
 * `selectFooterPolicy`. That's exactly the seam we want to assert
 * on; the rescue body itself is covered by
 * `caption-generator-organic-rescue.test.ts`.
 */

const BASE_INPUT = {
  businessSlug: "beautyfeel",
  businessName: "BeautyFeel",
  topic: "lipo suction",
};

const NON_PROMOTIONAL: OrganicPostCategory[] = [
  "TIPS_EDUCATION",
  "BEHIND_THE_SCENES",
  "SEASONAL_GREETING",
  "TEAM_SPOTLIGHT",
  "GENERAL",
];

// Wave N3: promotional footer is picked from a rotating pool so a single
// string match would be flaky. We match the union of pool entries — and
// also match "ServiceFlow" + booking verbs as a broader guard against
// any new pool entry slipping past these tests.
const PROMOTIONAL_CTA =
  /Book now through ServiceFlow|Pwede mag-book sa ServiceFlow|Mag-reserve na sa ServiceFlow|Lock in your slot through ServiceFlow|Slot mo na, book na sa ServiceFlow/i;
const PROMOTIONAL_DISCOVERY =
  /Tap through to see everything we offer|Silip mo rin ang ibang services namin|Check the full menu and pick what fits your week|Tingnan ang buong list of services|Browse the rest of our services kapag may time ka/i;

const SOFT_CTA_BY_CATEGORY: Record<
  Exclude<OrganicPostCategory, "SERVICE_SHOWCASE">,
  RegExp
> = {
  TIPS_EDUCATION: /Save this for later/i,
  BEHIND_THE_SCENES: /Drop by the page anytime/i,
  SEASONAL_GREETING: /Wishing you a restful season from all of us at BeautyFeel/i,
  TEAM_SPOTLIGHT: /Say hi when you visit/i,
  GENERAL: /We&rsquo;d love to hear what you think|We'd love to hear what you think/i,
};

describe("generateOrganicCaptionDraft — Wave I1 footer policy", () => {
  it.each(NON_PROMOTIONAL)(
    "%s gets a soft CTA — never the booking-forward one",
    async (category) => {
      const result = await generateOrganicCaptionDraft({ category, ...BASE_INPUT });

      // Hard rule: non-promotional categories never end with the
      // booking-forward CTA. This is the bug the user reported.
      expect(result.caption).not.toMatch(PROMOTIONAL_CTA);
      expect(result.caption).not.toMatch(PROMOTIONAL_DISCOVERY);

      // And they DO get the category-appropriate soft CTA.
      const softCtaPattern =
        SOFT_CTA_BY_CATEGORY[category as keyof typeof SOFT_CTA_BY_CATEGORY];
      expect(result.caption).toMatch(softCtaPattern);

      // Footer still includes the ServiceFlow URL — we want readers
      // to be able to discover the page, just without the booking
      // pitch in the line above it.
      expect(result.caption).toMatch(/serviceflow\./i);
    },
  );

  it("SERVICE_SHOWCASE keeps the booking-forward CTA — that's the post's purpose", async () => {
    const result = await generateOrganicCaptionDraft({
      ...BASE_INPUT,
      category: "SERVICE_SHOWCASE",
      topic: "signature facial",
    });

    expect(result.caption).toMatch(PROMOTIONAL_CTA);
    expect(result.caption).toMatch(PROMOTIONAL_DISCOVERY);
  });

  it("does not double-up the footer on regeneration of an already-finalized caption", async () => {
    // If the same caption is regenerated (e.g. owner clicks Regenerate
    // after having saved a draft), the existing footer must be stripped
    // and rewritten — never appended a second time.
    const result = await generateOrganicCaptionDraft({
      ...BASE_INPUT,
      category: "TIPS_EDUCATION",
    });

    // Soft CTA should appear exactly once.
    const softCtaMatches =
      result.caption.match(/Save this for later/gi) ?? [];
    expect(softCtaMatches.length).toBe(1);
  });
});

/**
 * Wave K1 — Hashtag policy is category-aware.
 *
 * Before this wave, every caption (organic or sale) carried
 * `#BookNow` and `#SulitPromo` from `buildFallbackHashtags`, even on
 * tips and team-spotlight posts. Those tags push the post into
 * promo-feed surfaces and contradict an educational tone.
 *
 * The fix mirrors the I1 footer policy: only promotional contexts
 * (sale-event flows with no postCategory, or organic SERVICE_SHOWCASE)
 * keep the promo tags. Everything else gets a calmer set, and any
 * Gemini-hallucinated promo tags are stripped at finalize.
 */
describe("generateOrganicCaptionDraft — Wave K1 hashtag policy", () => {
  it.each(NON_PROMOTIONAL)(
    "%s drops promotional hashtags from the fallback set",
    async (category) => {
      const result = await generateOrganicCaptionDraft({ category, ...BASE_INPUT });
      const lowered = result.hashtags.map((tag) => tag.toLowerCase());

      // Hard rule: none of the promotional tags are present.
      expect(lowered).not.toContain("#booknow");
      expect(lowered).not.toContain("#sulitpromo");
      expect(lowered).not.toContain("#flashsale");
      expect(lowered).not.toContain("#limitedslots");

      // Brand and self-care tags survive — they're neutral.
      expect(lowered).toContain("#serviceflow");
      expect(lowered).toContain("#selfcareph");
    },
  );

  it("SERVICE_SHOWCASE keeps the promotional hashtags — that's the post's purpose", async () => {
    const result = await generateOrganicCaptionDraft({
      ...BASE_INPUT,
      category: "SERVICE_SHOWCASE",
      topic: "signature facial",
    });
    const lowered = result.hashtags.map((tag) => tag.toLowerCase());

    expect(lowered).toContain("#booknow");
    expect(lowered).toContain("#sulitpromo");
  });
});
