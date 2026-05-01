import { afterEach, describe, expect, it, vi } from "vitest";

import { generateSocialCaptionDraft } from "@/lib/services/social/caption-generator";

const ORIGINAL_GEMINI_KEY = process.env.GEMINI_KEY;
const ORIGINAL_GEMINI_MODEL = process.env.GEMINI_CAPTION_MODEL;

const BASE_INPUT = {
  businessSlug: "beautyfeel",
  businessName: "Glow Studio",
  businessDescription: "Spa and beauty services in Puerto Princesa.",
  saleTitle: "Summer Hair Refresh",
  saleDescription: "Fresh colors and treatments for the season.",
  discountType: "PERCENTAGE" as const,
  discountValue: 20,
  startDate: new Date("2026-03-01T00:00:00.000Z"),
  endDate: new Date("2026-03-15T00:00:00.000Z"),
  serviceNames: ["Hair Color", "Keratin", "Scalp Treatment"],
  packageNames: ["Summer Glow Package"],
};

function expectRequiredEnding(caption: string) {
  expect(caption).toContain("Book now through ServiceFlow and claim your spot today.");
  expect(caption).toContain(`www.serviceflow.store/${BASE_INPUT.businessSlug}`);
  // Discovery line in first-person plural ("we offer") because the post is
  // from the business itself; "yourself" because we're addressing one reader.
  expect(caption).toContain("Tap through to see everything we offer and book yourself in.");
  expect(caption.trim().endsWith(`www.serviceflow.store/${BASE_INPUT.businessSlug}`)).toBe(
    true,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  process.env.GEMINI_KEY = ORIGINAL_GEMINI_KEY;
  process.env.GEMINI_CAPTION_MODEL = ORIGINAL_GEMINI_MODEL;
});

describe("generateSocialCaptionDraft", () => {
  it("returns rescue caption when Gemini is not configured", async () => {
    delete process.env.GEMINI_KEY;
    const output = await generateSocialCaptionDraft(BASE_INPUT);

    expect(output.caption).toContain("Summer Hair Refresh is live at Glow Studio");
    expectRequiredEnding(output.caption);
    expect(output.hashtags).toContain("#ServiceFlow");
  });

  it("uses natural one-day timing language in rescue caption", async () => {
    delete process.env.GEMINI_KEY;
    const output = await generateSocialCaptionDraft({
      ...BASE_INPUT,
      startDate: new Date("2026-02-14T00:00:00.000Z"),
      endDate: new Date("2026-02-14T23:59:59.000Z"),
    });

    expect(output.caption).toContain("Flash sale — today only.");
    expect(output.caption).not.toMatch(/from\s+\w+\s+\d+\s+to\s+\w+\s+\d+/i);
  });

  it("removes draft suffix from sale title in public caption text", async () => {
    delete process.env.GEMINI_KEY;
    const output = await generateSocialCaptionDraft({
      ...BASE_INPUT,
      saleTitle: "Holiday Stress-Off Package (Draft Suggestion)",
    });

    expect(output.caption).toContain("Holiday Stress-Off Package is live");
    expect(output.caption).not.toContain("(Draft Suggestion)");
  });

  it("uses Gemini JSON output when quality is acceptable", async () => {
    process.env.GEMINI_KEY = "test-key";

    const goodJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  caption:
                    "Date-ready ka ba this week, bes?\nKung stress ka sa work at life, this is your sign to pause and reset.\nGlow Studio has a summer refresh promo that helps you relax and feel more confident.\nPerfect ito for solo self-care day or catch-up time with your bestie.\n\nTry these crowd favorites:\n- Hair Color\n- Keratin\n- Scalp Treatment\n\nLimited slots lang, kaya reserve your preferred time early.\nBook now through ServiceFlow and lock your spot today.",
                  hashtags: ["#GlowStudio", "#SalonPromo", "ServiceFlow"],
                }),
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(goodJson), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const output = await generateSocialCaptionDraft(BASE_INPUT);
    expect(output.caption).toContain("Date-ready ka ba this week, bes?");
    expect(output.caption).toContain("\n\nTry these crowd favorites:");
    expectRequiredEnding(output.caption);
    expect(output.hashtags).toEqual([
      "#GlowStudio",
      "#SalonPromo",
      "#ServiceFlow",
    ]);
  });

  it("runs rewrite pass when initial Gemini caption is too short", async () => {
    process.env.GEMINI_KEY = "test-key";

    const shortJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  caption: "Date",
                  hashtags: ["#BeautyFeel", "#SelfCarePH"],
                }),
              },
            ],
          },
        },
      ],
    };

    const rewrittenJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  caption:
                    "Single, taken, or busy sa work?\nDeserve mo pa rin ng quality me-time this week.\nBeautyFeel has a promo that helps you unwind and glow up without guilt.\n\nTry these crowd favorites:\n- Underarm wax\n- Whole legs\n- Whole body scrub\n\nBring your bestie or enjoy a solo reset day.\nLimited slots lang, so reserve early para sa preferred time mo.\nBook now through ServiceFlow and claim your spot today.",
                  hashtags: ["#BeautyFeel", "#SelfCarePH", "#BookNow"],
                }),
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify(shortJson), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify(rewrittenJson), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

    const output = await generateSocialCaptionDraft(BASE_INPUT);
    expect(output.caption).toContain("Single, taken, or busy sa work?");
    expectRequiredEnding(output.caption);
    expect(output.hashtags).toContain("#BeautyFeel");
  });

  it("falls back to rescue caption when Gemini fails", async () => {
    process.env.GEMINI_KEY = "test-key";

    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { message: "Temporary provider failure" },
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    const output = await generateSocialCaptionDraft(BASE_INPUT);
    expect(output.caption).toContain("Summer Hair Refresh is live at Glow Studio");
    expectRequiredEnding(output.caption);
    expect(output.hashtags).toContain("#ServiceFlow");
  });

  it("removes hashtag-only lines from caption body", async () => {
    process.env.GEMINI_KEY = "test-key";

    const badPlainText = {
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  "Date ready? Or self-love muna this week?\nBeautyFeel has your back with feel-good services.\nBook now through ServiceFlow.\n#BeautyFeel #ServiceFlow",
              },
            ],
          },
        },
      ],
    };

    const rewrittenJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  caption:
                    "Date ready? Or self-love muna this week?\nBeautyFeel has your back with feel-good services designed to help you relax.\nIf pagod ka from work, this is your sign to reset and recharge.\n\nTry these crowd favorites:\n- Foot spa\n- Whole body scrub\n- Underarm wax\n\nReserve your preferred schedule early before slots fill up.\nBook now through ServiceFlow.",
                  hashtags: ["#BeautyFeel", "#ServiceFlow", "#SelfCarePH"],
                }),
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify(badPlainText), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify(rewrittenJson), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

    const output = await generateSocialCaptionDraft(BASE_INPUT);
    expect(output.caption).not.toContain("#BeautyFeel");
    expect(output.hashtags).toContain("#BeautyFeel");
    expectRequiredEnding(output.caption);
  });

  it("removes internal meta lines from generated caption", async () => {
    process.env.GEMINI_KEY = "test-key";

    const withMetaLines = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  caption:
                    'Single ka ba this season?\nHoliday season vibe ito, based on your "Christmas Sale" promo.\nFocused categories: Eyelash.\n15% OFF on Holiday Stress-Off Package from Feb 14 to Feb 14.\nUpcoming Valentine\'s Day on 2026-02-14 can drive prep bookings.\nProm Season is active. Student and family-prep offers can improve conversion this season. Review selected services/packages before publishing.\nBeautyFeel has your back for your holiday glow-up.\n\nTry these crowd favorites:\n- Cat eye\n- Classic eyelash extensions\n\nLimited slots lang, reserve now.',
                  hashtags: ["#BeautyFeel", "#Eyelash", "#ServiceFlow"],
                }),
              },
            ],
          },
        },
      ],
    };

    const rewrittenJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  caption:
                    "Single, taken, or busy sa work?\nDeserve mo pa rin ng glow-up this week.\nBeautyFeel has a Christmas Sale promo designed for your holiday-ready look.\n\nTry these crowd favorites:\n- Cat eye\n- Classic eyelash extensions\n- Doll eye\n- Eyebrow lamination\n\nPerfect for confidence boost and fresh photos this season.\nLimited slots lang, so reserve your preferred time early.\nBook now through ServiceFlow and claim your spot today.",
                  hashtags: ["#BeautyFeel", "#Eyelash", "#ServiceFlow"],
                }),
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify(withMetaLines), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify(rewrittenJson), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

    const output = await generateSocialCaptionDraft(BASE_INPUT);
    expect(output.caption.toLowerCase()).not.toContain("focused categories:");
    expect(output.caption.toLowerCase()).not.toContain("based on your");
    expect(output.caption.toLowerCase()).not.toContain("can drive prep bookings");
    expect(output.caption.toLowerCase()).not.toContain("season is active");
    expect(output.caption.toLowerCase()).not.toContain("can improve conversion");
    expect(output.caption.toLowerCase()).not.toContain(
      "review selected services/packages before publishing",
    );
    expect(output.caption.toLowerCase()).not.toContain("from feb 14 to feb 14");
    expectRequiredEnding(output.caption);
  });
});
