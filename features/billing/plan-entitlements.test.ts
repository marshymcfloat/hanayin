import { describe, expect, it } from "vitest";

import { resolveEntitlements, resolveTier } from "./plan-entitlements";

describe("billing plan entitlements", () => {
  it("maps STARTER_MONTHLY to starter entitlements", () => {
    expect(resolveTier("STARTER_MONTHLY")).toBe("STARTER");
    expect(resolveEntitlements("STARTER_MONTHLY")).toEqual({
      website: false,
      growth: false,
      social: false,
      ai: false,
      reportsCore: true,
      reportsAdvanced: false,
    });
  });

  it("maps PLUS_MONTHLY to plus entitlements", () => {
    expect(resolveTier("PLUS_MONTHLY")).toBe("PLUS");
    expect(resolveEntitlements("PLUS_MONTHLY")).toEqual({
      website: true,
      growth: true,
      social: false,
      ai: false,
      reportsCore: true,
      reportsAdvanced: true,
    });
  });

  it("maps PRO_MONTHLY to pro entitlements", () => {
    expect(resolveTier("PRO_MONTHLY")).toBe("PRO");
    expect(resolveEntitlements("PRO_MONTHLY")).toEqual({
      website: true,
      growth: true,
      social: true,
      ai: true,
      reportsCore: true,
      reportsAdvanced: true,
    });
  });

  it("maps legacy PRO_ANNUAL to pro entitlements", () => {
    expect(resolveTier("PRO_ANNUAL")).toBe("PRO");
    expect(resolveEntitlements("PRO_ANNUAL")).toEqual({
      website: true,
      growth: true,
      social: true,
      ai: true,
      reportsCore: true,
      reportsAdvanced: true,
    });
  });

  it("defaults unknown or missing plan codes to starter", () => {
    expect(resolveTier("UNKNOWN_PLAN")).toBe("STARTER");
    expect(resolveTier(undefined)).toBe("STARTER");
    expect(resolveTier(null)).toBe("STARTER");
    expect(resolveEntitlements("UNKNOWN_PLAN")).toEqual({
      website: false,
      growth: false,
      social: false,
      ai: false,
      reportsCore: true,
      reportsAdvanced: false,
    });
  });
});
