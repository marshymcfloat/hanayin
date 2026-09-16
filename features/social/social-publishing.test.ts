import { afterEach, describe, expect, it } from "vitest";

import {
  getSocialPublishingPilotSlugs,
  isSocialPublishingEnabledForBusiness,
  isSocialPublishingGloballyEnabled,
} from "@/features/social/social-publishing";

const ORIGINAL_ENABLED = process.env.SOCIAL_PUBLISHING_ENABLED;
const ORIGINAL_PILOT = process.env.SOCIAL_PUBLISHING_PILOT_SLUGS;

describe("social publishing feature flags", () => {
  afterEach(() => {
    process.env.SOCIAL_PUBLISHING_ENABLED = ORIGINAL_ENABLED;
    process.env.SOCIAL_PUBLISHING_PILOT_SLUGS = ORIGINAL_PILOT;
  });

  it("respects global disabled flag", () => {
    process.env.SOCIAL_PUBLISHING_ENABLED = "false";
    process.env.SOCIAL_PUBLISHING_PILOT_SLUGS = "demo";

    expect(isSocialPublishingGloballyEnabled()).toBe(false);
    expect(isSocialPublishingEnabledForBusiness("demo")).toBe(false);
  });

  it("enables all businesses when pilot list is empty", () => {
    process.env.SOCIAL_PUBLISHING_ENABLED = "true";
    process.env.SOCIAL_PUBLISHING_PILOT_SLUGS = "";

    expect(getSocialPublishingPilotSlugs()).toEqual([]);
    expect(isSocialPublishingEnabledForBusiness("any-business")).toBe(true);
  });

  it("matches specific pilot slugs", () => {
    process.env.SOCIAL_PUBLISHING_ENABLED = "true";
    process.env.SOCIAL_PUBLISHING_PILOT_SLUGS = "alpha, beta";

    expect(isSocialPublishingEnabledForBusiness("alpha")).toBe(true);
    expect(isSocialPublishingEnabledForBusiness("BETA")).toBe(true);
    expect(isSocialPublishingEnabledForBusiness("gamma")).toBe(false);
  });
});
