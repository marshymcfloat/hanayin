import { describe, expect, it } from "vitest";

import { asPercentage, median, roundTo, safeDivide } from "./calculations";

describe("reports calculations", () => {
  it("handles safe divide edge cases", () => {
    expect(safeDivide(10, 2)).toBe(5);
    expect(safeDivide(10, 0)).toBe(0);
    expect(safeDivide(Number.NaN, 5)).toBe(0);
  });

  it("converts to percentage with guard rails", () => {
    expect(asPercentage(1, 4)).toBe(25);
    expect(asPercentage(0, 0)).toBe(0);
  });

  it("calculates median for odd and even arrays", () => {
    expect(median([])).toBe(0);
    expect(median([1, 3, 2])).toBe(2);
    expect(median([4, 1, 2, 9])).toBe(3);
  });

  it("rounds consistently", () => {
    expect(roundTo(12.3456)).toBe(12.35);
    expect(roundTo(12.341, 1)).toBe(12.3);
  });
});
