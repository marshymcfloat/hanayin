import { describe, expect, it } from "vitest";

import {
  buildOrganicRescueCaption,
  type OrganicPostCategory,
} from "@/lib/services/social/caption-generator";

/**
 * H7 — Snapshot-style assertions on the per-category rescue captions.
 *
 * The rescue is the floor that every owner sees when Gemini is
 * unconfigured / fails / returns garbage. Pinning the structure here
 * means a future change to the rescue text shows up in code review
 * (the snapshot fails), not silently in production where an owner
 * thought their AI was running.
 *
 * We avoid full-string snapshots because the openers are randomized
 * (`pickRandom(...)`); instead we assert the structural pieces a
 * reasonable rescue must contain for each category.
 */

const CATEGORIES_TO_TEST: OrganicPostCategory[] = [
  "TIPS_EDUCATION",
  "BEHIND_THE_SCENES",
  "SEASONAL_GREETING",
  "TEAM_SPOTLIGHT",
  "GENERAL",
  "SERVICE_SHOWCASE",
];

const BASE_INPUT = {
  topic: "skin tag",
  businessName: "BeautyFeel",
  businessSlug: "beautyfeel",
};

describe("buildOrganicRescueCaption — per-category structure", () => {
  it.each(CATEGORIES_TO_TEST)(
    "%s rescue includes the topic and never falls back to sale-promo language",
    (category) => {
      const result = buildOrganicRescueCaption({ category, ...BASE_INPUT });

      // Core: topic appears in the output, business name appears at
      // most once (rescues are not multi-mention promo).
      expect(result.caption).toMatch(/skin tag/i);

      // Never include the offending sale-promo phrasing the user
      // reported. These phrases were the exact symptom of the bug.
      const forbidden = [
        /Bookings open today/i,
        /Preferred times fill up first/i,
        /Tap the booking link below/i,
        /Slots are limited/i,
        /reserve early para hindi/i,
      ];
      for (const pattern of forbidden) {
        expect(result.caption).not.toMatch(pattern);
      }
    },
  );

  it("TIPS_EDUCATION leads with a tip, not a booking pitch", () => {
    const result = buildOrganicRescueCaption({
      category: "TIPS_EDUCATION",
      ...BASE_INPUT,
    });
    // Tip-shaped openers from the rescue array.
    expect(result.caption).toMatch(
      /tip|reminder|small thing|Real talk/i,
    );
    // Has at least one bullet. formatCaptionForSocialFeed normalizes
    // unicode • to ASCII - for feed compatibility, so we accept either.
    expect(result.caption).toMatch(/^[•-] /m);
  });

  it("SEASONAL_GREETING never invites a booking", () => {
    const result = buildOrganicRescueCaption({
      category: "SEASONAL_GREETING",
      ...BASE_INPUT,
      topic: "Mother's Day",
    });
    // Booking-related verbs are out for greetings.
    expect(result.caption).not.toMatch(/book your slot|book now|reserve/i);
  });

  it("includes the owner's caption direction when provided", () => {
    const result = buildOrganicRescueCaption({
      category: "TIPS_EDUCATION",
      ...BASE_INPUT,
      ownerCaptionDirection: "lean into the prevention angle",
    });
    expect(result.caption).toMatch(/lean into the prevention angle/);
  });

  it("falls back gracefully when topic is empty", () => {
    const result = buildOrganicRescueCaption({
      category: "GENERAL",
      ...BASE_INPUT,
      topic: "",
    });
    // Don't crash; produce something readable. The default fills in
    // "self-care" so the post is at least coherent.
    expect(result.caption.length).toBeGreaterThan(0);
    expect(result.caption).toMatch(/self-care/i);
  });
});

/**
 * Wave M2 — TIPS_EDUCATION rescue is now structurally educational, not
 * a list of generic life maxims.
 *
 * Old shape (the bug): "Be consistent / Listen to your body / Ask
 * before you experiment" — same body across every topic, taught nothing.
 *
 * New shape: opener + topic-aware education break + "Here's what people
 * often ask us:" + 5 question-led bullets + "Additional tip:" + soft
 * close. Hits ~12 lines / 100+ words even when fully templated. The
 * "Additional tip:" line is the practical action hook the user
 * specifically asked for.
 */
describe("buildOrganicRescueCaption — Wave M2 TIPS_EDUCATION shape", () => {
  it("contains an Additional tip line", () => {
    const result = buildOrganicRescueCaption({
      category: "TIPS_EDUCATION",
      ...BASE_INPUT,
    });
    expect(result.caption).toMatch(/Additional tip:/);
  });

  it("uses inviting question framing — 'Did you know' or 'often ask us'", () => {
    const result = buildOrganicRescueCaption({
      category: "TIPS_EDUCATION",
      ...BASE_INPUT,
    });
    expect(result.caption).toMatch(/Did you know|often ask us/i);
  });

  it("renders at least 5 bullet lines (4 educational + 1 additional tip)", () => {
    const result = buildOrganicRescueCaption({
      category: "TIPS_EDUCATION",
      ...BASE_INPUT,
    });
    // formatCaptionForSocialFeed may normalize unicode • to ASCII -.
    // Count both for forward compatibility.
    const bulletLines = result.caption
      .split(/\r?\n/)
      .filter((line) => /^[•-]\s/.test(line.trim()));
    expect(bulletLines.length).toBeGreaterThanOrEqual(5);
  });

  it("hits a substantial body length (>= 90 words)", () => {
    const result = buildOrganicRescueCaption({
      category: "TIPS_EDUCATION",
      ...BASE_INPUT,
    });
    // Educational posts that are too short feel hollow. The user
    // explicitly asked for substantial content.
    const wordCount = result.caption.trim().split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(90);
  });

  it("weaves the topic into the body, not just the header", () => {
    const result = buildOrganicRescueCaption({
      category: "TIPS_EDUCATION",
      ...BASE_INPUT,
      topic: "lipo suction",
    });
    // The new rescue mentions the topic at least twice — once in the
    // education-break opener, once in the additional-tip bullet.
    const occurrences = (
      result.caption.match(/lipo suction/gi) ?? []
    ).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});
