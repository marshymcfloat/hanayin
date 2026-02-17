import { describe, expect, it } from "vitest";

import {
  DEFAULT_GROWTH_TONE_PROFILE,
  normalizeGrowthToneProfile,
} from "@/lib/services/growth/tone-profiles";

describe("normalizeGrowthToneProfile", () => {
  it("keeps known tone profiles", () => {
    expect(normalizeGrowthToneProfile("clinical-trust")).toBe("clinical-trust");
  });

  it("falls back to default for unknown values", () => {
    expect(normalizeGrowthToneProfile("custom-vip-style")).toBe(
      DEFAULT_GROWTH_TONE_PROFILE,
    );
  });
});
