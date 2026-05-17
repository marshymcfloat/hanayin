import { describe, expect, it } from "vitest";
import {
  classifySelfServeWindow,
  isSelfServeAllowed,
} from "./booking-self-serve-policy";

describe("classifySelfServeWindow", () => {
  const now = new Date("2026-05-10T12:00:00Z");

  it("returns 'free' when more than 24h ahead", () => {
    const tomorrowPlus = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    expect(classifySelfServeWindow(tomorrowPlus, now)).toBe("free");
  });

  it("returns 'short_notice' between 6h and 24h ahead", () => {
    const inEightHours = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    expect(classifySelfServeWindow(inEightHours, now)).toBe("short_notice");
    const inTwentyHours = new Date(now.getTime() + 20 * 60 * 60 * 1000);
    expect(classifySelfServeWindow(inTwentyHours, now)).toBe("short_notice");
  });

  it("returns 'blocked' inside the 6h window", () => {
    const inFiveHours = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    expect(classifySelfServeWindow(inFiveHours, now)).toBe("blocked");
  });

  it("returns 'blocked' for past appointments", () => {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(classifySelfServeWindow(yesterday, now)).toBe("blocked");
  });

  it("returns 'blocked' when scheduledAt is null/undefined", () => {
    expect(classifySelfServeWindow(null, now)).toBe("blocked");
    expect(classifySelfServeWindow(undefined, now)).toBe("blocked");
  });

  it("treats the exact 24h boundary as free (≥ 24h ⇒ free)", () => {
    // Industry convention: "free cancellation up to 24 hours before"
    // — being exactly 24h out is still free.
    const exactly24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    expect(classifySelfServeWindow(exactly24h, now)).toBe("free");
  });

  it("treats the exact 6h boundary as blocked (be conservative)", () => {
    // <= 6h is blocked. Customer at the boundary should call.
    const exactly6h = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    expect(classifySelfServeWindow(exactly6h, now)).toBe("blocked");
  });
});

describe("isSelfServeAllowed", () => {
  const now = new Date("2026-05-10T12:00:00Z");

  it("allows free + short_notice tiers", () => {
    expect(
      isSelfServeAllowed(new Date(now.getTime() + 25 * 60 * 60 * 1000), now),
    ).toBe(true);
    expect(
      isSelfServeAllowed(new Date(now.getTime() + 8 * 60 * 60 * 1000), now),
    ).toBe(true);
  });

  it("denies blocked tier", () => {
    expect(
      isSelfServeAllowed(new Date(now.getTime() + 5 * 60 * 60 * 1000), now),
    ).toBe(false);
    expect(isSelfServeAllowed(null, now)).toBe(false);
  });
});
