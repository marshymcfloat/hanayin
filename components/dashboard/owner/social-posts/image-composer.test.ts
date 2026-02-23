import { describe, expect, it } from "vitest";

import { wrapText } from "./image-composer";

describe("image-composer wrapText", () => {
  it("wraps text into multiple lines within max width", () => {
    const context = {
      measureText: (value: string) => ({ width: value.length * 8 }),
    };

    const result = wrapText(context, "Quiet Hours Body Reset Campaign", 100, 3);

    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.truncated).toBe(false);
  });

  it("clamps and marks overflow when max lines are exceeded", () => {
    const context = {
      measureText: (value: string) => ({ width: value.length * 8 }),
    };

    const result = wrapText(
      context,
      "This is a very long sentence intended to overflow the text container in a predictable way",
      80,
      2,
    );

    expect(result.lines.length).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.lines[1]?.endsWith("...")).toBe(true);
  });
});
