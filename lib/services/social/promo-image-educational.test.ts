import { describe, expect, it } from "vitest";

import {
  pickEducationalHeadline,
  pickEducationalTips,
} from "./promo-image";

describe("pickEducationalHeadline (Wave H6)", () => {
  it("prefers the topic when set", () => {
    expect(
      pickEducationalHeadline("hydraderma facial", "ignored caption text"),
    ).toBe("hydraderma facial");
  });

  it("falls back to the first non-hashtag caption line when topic is empty", () => {
    expect(
      pickEducationalHeadline(
        "",
        "#someTag\nFirst real line\n- bullet not used as headline",
      ),
    ).toBe("First real line");
  });

  it("returns null when neither topic nor caption is usable", () => {
    expect(pickEducationalHeadline(null, null)).toBeNull();
    expect(pickEducationalHeadline("   ", "  \n   ")).toBeNull();
    expect(pickEducationalHeadline("", "#onlyHashtag\n#another")).toBeNull();
  });
});

describe("pickEducationalTips (Wave K2)", () => {
  const sample = `Quick self-care tip you can try today:
Today's topic: hydraderma facial.
A few things worth knowing:

- Be consistent — small habits compound faster than dramatic resets.
- Listen to what your skin / body is telling you, not the trend cycle.
- Ask before you experiment — your stylist or therapist has seen it before.

If you want to talk through hydraderma facial with us, we're around.`;

  it("extracts up to 3 hyphenated bullet tips", () => {
    const tips = pickEducationalTips(sample);
    expect(tips.length).toBe(3);
    expect(tips[0]).toMatch(/^Be consistent/);
    expect(tips[1]).toMatch(/^Listen to what/);
    expect(tips[2]).toMatch(/^Ask before you/);
  });

  it("supports asterisk and bullet glyph prefixes", () => {
    const txt = "* Tip A\n• Tip B\n- Tip C\n- Tip D";
    const tips = pickEducationalTips(txt);
    expect(tips).toEqual(["Tip A", "Tip B", "Tip C"]);
  });

  it("supports numbered prefixes", () => {
    const txt = "1. First tip\n2) Second tip\n3. Third tip\n4. Fourth";
    const tips = pickEducationalTips(txt);
    expect(tips).toEqual(["First tip", "Second tip", "Third tip"]);
  });

  it("returns empty array when caption has no bullet structure", () => {
    expect(pickEducationalTips("Just a single sentence with no list.")).toEqual([]);
    expect(pickEducationalTips(null)).toEqual([]);
    expect(pickEducationalTips("   ")).toEqual([]);
  });

  it("clips overly long bullets to a safe length with ellipsis", () => {
    const longTip = "- " + "This is a very long bullet ".repeat(8);
    const tips = pickEducationalTips(longTip);
    expect(tips.length).toBe(1);
    expect(tips[0].length).toBeLessThanOrEqual(91); // max + ellipsis
    expect(tips[0]).toMatch(/…$/);
  });

  it("ignores empty bullet bodies", () => {
    const txt = "- \n- Real tip\n- ";
    const tips = pickEducationalTips(txt);
    expect(tips).toEqual(["Real tip"]);
  });
});
