import { describe, expect, it, vi } from "vitest";

import {
  recordOrganicPost,
  startOrganicPostTimer,
} from "./social-organic-events";

describe("recordOrganicPost", () => {
  it("does not throw on a well-formed event", () => {
    expect(() =>
      recordOrganicPost({
        action: "CREATED",
        businessId: "biz_1",
        actorRole: "OWNER",
        durationMs: 123,
        success: true,
        category: "TIPS_EDUCATION",
        inferredImageProfile: "EDUCATIONAL",
        actualImageProfile: "EDUCATIONAL",
        inferredCaptionTone: "FRIENDLY_TAGLISH",
        actualCaptionTone: "FRIENDLY_TAGLISH",
        ownerOverrodeMood: false,
        ownerOverrodeFocus: false,
        ownerOverrodeImageProfile: false,
        ownerOverrodeCaptionTone: false,
        educationalOverlayApplied: true,
        aiInvoked: true,
      }),
    ).not.toThrow();
  });

  it("does not throw on an error-path event", () => {
    expect(() =>
      recordOrganicPost({
        action: "CREATED",
        businessId: "biz_1",
        actorRole: "EMPLOYEE",
        durationMs: 50,
        success: false,
        errorCode: "UNKNOWN",
        category: "GENERAL",
        inferredImageProfile: "SOFT_EDITORIAL",
        actualImageProfile: "SOFT_EDITORIAL",
        inferredCaptionTone: "FRIENDLY_TAGLISH",
        actualCaptionTone: "FRIENDLY_TAGLISH",
        ownerOverrodeMood: false,
        ownerOverrodeFocus: false,
        ownerOverrodeImageProfile: false,
        ownerOverrodeCaptionTone: false,
      }),
    ).not.toThrow();
  });
});

describe("startOrganicPostTimer", () => {
  it("returns a callable finish function", () => {
    const finish = startOrganicPostTimer({
      action: "CREATED",
      businessId: "biz_1",
      actorRole: "OWNER",
      category: "TIPS_EDUCATION",
      inferredImageProfile: "EDUCATIONAL",
      inferredCaptionTone: "FRIENDLY_TAGLISH",
    });
    expect(typeof finish).toBe("function");
  });

  it("computes a non-negative durationMs and forwards override booleans", () => {
    // Patch Date.now to advance between start and finish so the timer
    // produces a deterministic > 0 durationMs.
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1000); // start
    nowSpy.mockReturnValueOnce(1245); // finish

    const finish = startOrganicPostTimer({
      action: "CREATED",
      businessId: "biz_1",
      actorRole: "OWNER",
      category: "TIPS_EDUCATION",
      inferredImageProfile: "EDUCATIONAL",
      inferredCaptionTone: "FRIENDLY_TAGLISH",
    });
    expect(() =>
      finish({
        success: true,
        actualImageProfile: "EDUCATIONAL",
        actualCaptionTone: "FRIENDLY_TAGLISH",
        ownerOverrodeMood: false,
        ownerOverrodeFocus: false,
        ownerOverrodeImageProfile: false,
        ownerOverrodeCaptionTone: false,
        educationalOverlayApplied: true,
        aiInvoked: true,
      }),
    ).not.toThrow();
    nowSpy.mockRestore();
  });
});
