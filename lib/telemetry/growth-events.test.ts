import { describe, expect, it, vi } from "vitest";

import {
  recordGrowthCampaign,
  startGrowthCampaignTimer,
} from "./growth-events";

describe("recordGrowthCampaign", () => {
  it("does not throw on a well-formed success event", () => {
    expect(() =>
      recordGrowthCampaign({
        action: "GENERATED",
        businessId: "biz_1",
        actorRole: "OWNER",
        durationMs: 4321,
        success: true,
        offerType: "FLASH_DEAL",
        inferredCaptionTone: "DIRECT_URGENT",
        actualCaptionTone: "DIRECT_URGENT",
        inferredImageProfile: "BOLD_MONOCHROME",
        actualImageProfile: "BOLD_MONOCHROME",
        ownerOverrodeCaptionTone: false,
        ownerOverrodeImageProfile: false,
        aiInvoked: true,
      }),
    ).not.toThrow();
  });

  it("does not throw when owner overrode both axes", () => {
    expect(() =>
      recordGrowthCampaign({
        action: "GENERATED",
        businessId: "biz_2",
        actorRole: "OWNER",
        durationMs: 3000,
        success: true,
        offerType: "BUNDLE",
        inferredCaptionTone: "FRIENDLY_TAGLISH",
        actualCaptionTone: "WARM_NURTURING",
        inferredImageProfile: "MODERN_GRAPHIC",
        actualImageProfile: "PHOTO_REALISTIC",
        ownerOverrodeCaptionTone: true,
        ownerOverrodeImageProfile: true,
        aiInvoked: true,
      }),
    ).not.toThrow();
  });
});

describe("startGrowthCampaignTimer", () => {
  it("returns a finish function that accepts the actual + override payload", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(2000);
    nowSpy.mockReturnValueOnce(5500);

    const finish = startGrowthCampaignTimer({
      action: "GENERATED",
      businessId: "biz_3",
      actorRole: "OWNER",
      offerType: "LOYALTY_REWARD",
      inferredCaptionTone: "WARM_NURTURING",
      inferredImageProfile: "SOFT_EDITORIAL",
    });
    expect(typeof finish).toBe("function");
    expect(() =>
      finish({
        success: true,
        actualCaptionTone: "WARM_NURTURING",
        actualImageProfile: "SOFT_EDITORIAL",
        ownerOverrodeCaptionTone: false,
        ownerOverrodeImageProfile: false,
        aiInvoked: true,
      }),
    ).not.toThrow();
    nowSpy.mockRestore();
  });
});
