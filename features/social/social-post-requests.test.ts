import { afterEach, describe, expect, it } from "vitest";

import {
  getSocialPostRequestsPilotSlugs,
  isSocialPostRequestsEnabledForBusiness,
  isSocialPostRequestsGloballyEnabled,
} from "@/features/social/social-post-requests";

const ORIG = {
  enabled: process.env.SOCIAL_POST_REQUESTS_ENABLED,
  pilot: process.env.SOCIAL_POST_REQUESTS_PILOT_SLUGS,
  parentEnabled: process.env.SOCIAL_PUBLISHING_ENABLED,
  parentPilot: process.env.SOCIAL_PUBLISHING_PILOT_SLUGS,
};

describe("social-post-requests feature flag", () => {
  afterEach(() => {
    process.env.SOCIAL_POST_REQUESTS_ENABLED = ORIG.enabled;
    process.env.SOCIAL_POST_REQUESTS_PILOT_SLUGS = ORIG.pilot;
    process.env.SOCIAL_PUBLISHING_ENABLED = ORIG.parentEnabled;
    process.env.SOCIAL_PUBLISHING_PILOT_SLUGS = ORIG.parentPilot;
  });

  it("respects own global disable", () => {
    process.env.SOCIAL_PUBLISHING_ENABLED = "true";
    process.env.SOCIAL_PUBLISHING_PILOT_SLUGS = "";
    process.env.SOCIAL_POST_REQUESTS_ENABLED = "false";
    expect(isSocialPostRequestsGloballyEnabled()).toBe(false);
    expect(isSocialPostRequestsEnabledForBusiness("alpha")).toBe(false);
  });

  it("falls back to false when parent SOCIAL_PUBLISHING_ENABLED is off", () => {
    process.env.SOCIAL_PUBLISHING_ENABLED = "false";
    process.env.SOCIAL_POST_REQUESTS_ENABLED = "true";
    process.env.SOCIAL_POST_REQUESTS_PILOT_SLUGS = "";
    expect(isSocialPostRequestsEnabledForBusiness("alpha")).toBe(false);
  });

  it("enables all businesses when both flags are on and pilot is empty", () => {
    process.env.SOCIAL_PUBLISHING_ENABLED = "true";
    process.env.SOCIAL_PUBLISHING_PILOT_SLUGS = "";
    process.env.SOCIAL_POST_REQUESTS_ENABLED = "true";
    process.env.SOCIAL_POST_REQUESTS_PILOT_SLUGS = "";
    expect(getSocialPostRequestsPilotSlugs()).toEqual([]);
    expect(isSocialPostRequestsEnabledForBusiness("alpha")).toBe(true);
  });

  it("matches pilot slugs case-insensitively", () => {
    process.env.SOCIAL_PUBLISHING_ENABLED = "true";
    process.env.SOCIAL_PUBLISHING_PILOT_SLUGS = "";
    process.env.SOCIAL_POST_REQUESTS_ENABLED = "true";
    process.env.SOCIAL_POST_REQUESTS_PILOT_SLUGS = "alpha, beta";
    expect(isSocialPostRequestsEnabledForBusiness("alpha")).toBe(true);
    expect(isSocialPostRequestsEnabledForBusiness("BETA")).toBe(true);
    expect(isSocialPostRequestsEnabledForBusiness("gamma")).toBe(false);
  });
});
