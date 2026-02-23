import { describe, expect, it } from "vitest";

import {
  buildDefaultOverlayDraftFromPost,
  parseSocialImageOverlayDraft,
  sanitizeOverlayDraft,
} from "./image-overlay";

describe("image-overlay", () => {
  it("builds default overlay fields from sale event context", () => {
    const draft = buildDefaultOverlayDraftFromPost({
      businessName: "BeautyFeel",
      title: "Quiet Hours Body Reset",
      saleDescription: "Limited slots",
      discountType: "PERCENTAGE",
      discountValue: 15,
      startDate: new Date("2026-02-23T00:00:00.000Z"),
      endDate: new Date("2026-02-25T00:00:00.000Z"),
    });

    expect(draft.businessName).toBe("BeautyFeel");
    expect(draft.discountLine).toBe("15% OFF");
    expect(draft.titleLine).toBe("Quiet Hours Body Reset");
    expect(draft.supportLine).toBe("Limited slots");
    expect(draft.ctaLine).toBe("Book now on ServiceFlow");
  });

  it("sanitizes and clamps overlay text fields", () => {
    const draft = sanitizeOverlayDraft({
      businessName: "  BeautyFeel   BeautyFeel BeautyFeel BeautyFeel BeautyFeel BeautyFeel ",
      discountLine: "  15%      OFF  ",
      titleLine:
        "  Quiet Hours Body Reset Super Long Campaign Name That Should Be Trimmed For Safety  ",
      dateLine: " Feb 23  -  Feb 25 ",
      ctaLine: "  Book now on ServiceFlow immediately for limited slots  ",
      supportLine:
        " This support line is intentionally very long to verify that it gets clamped and normalized into a safe length for the card composer output. ",
      theme: "dark-card",
    });

    expect(draft.discountLine).toBe("15% OFF");
    expect(draft.titleLine.length).toBeLessThanOrEqual(80);
    expect(draft.supportLine.length).toBeLessThanOrEqual(120);
    expect(draft.theme).toBe("dark-card");
  });

  it("removes draft markers from overlay title", () => {
    const draft = sanitizeOverlayDraft({
      titleLine: "Student Calm Hour (Draft Suggestion)",
    });

    expect(draft.titleLine).toBe("Student Calm Hour");
  });

  it("supports layout and card position controls with clamping", () => {
    const draft = sanitizeOverlayDraft({
      layoutStyle: "clean-minimal",
      cardXPercent: 150,
      cardYPercent: -40,
      cardSizePercent: 999,
    });

    expect(draft.layoutStyle).toBe("clean-minimal");
    expect(draft.cardXPercent).toBe(100);
    expect(draft.cardYPercent).toBe(0);
    expect(draft.cardSizePercent).toBe(118);
  });

  it("parses persisted overlay json safely", () => {
    const parsed = parseSocialImageOverlayDraft({
      businessName: "BeautyFeel",
      discountLine: "15% OFF",
      titleLine: "Quiet Hours Body Reset",
      dateLine: "Feb 23 - Feb 25",
      ctaLine: "Book now on ServiceFlow",
      supportLine: "Limited slots",
      theme: "light-card",
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.titleLine).toBe("Quiet Hours Body Reset");
  });
});
