import { afterEach, describe, expect, it } from "vitest";

import {
  getBookingEditorPilotSlugs,
  isBookingEditorEnabledForBusiness,
  isBookingEditorGloballyEnabled,
} from "@/lib/features/booking-editor";

const ORIGINAL_ENABLED = process.env.BOOKING_EDITOR_ENABLED;
const ORIGINAL_PILOT = process.env.BOOKING_EDITOR_PILOT_SLUGS;

describe("booking-editor feature flags", () => {
  afterEach(() => {
    process.env.BOOKING_EDITOR_ENABLED = ORIGINAL_ENABLED;
    process.env.BOOKING_EDITOR_PILOT_SLUGS = ORIGINAL_PILOT;
  });

  it("respects global disabled flag", () => {
    process.env.BOOKING_EDITOR_ENABLED = "false";
    process.env.BOOKING_EDITOR_PILOT_SLUGS = "demo";

    expect(isBookingEditorGloballyEnabled()).toBe(false);
    expect(isBookingEditorEnabledForBusiness("demo")).toBe(false);
  });

  it("enables all businesses when pilot list is empty", () => {
    process.env.BOOKING_EDITOR_ENABLED = "true";
    process.env.BOOKING_EDITOR_PILOT_SLUGS = "";

    expect(getBookingEditorPilotSlugs()).toEqual([]);
    expect(isBookingEditorEnabledForBusiness("any-business")).toBe(true);
  });

  it("matches specific pilot slugs case-insensitively", () => {
    process.env.BOOKING_EDITOR_ENABLED = "true";
    process.env.BOOKING_EDITOR_PILOT_SLUGS = "alpha, beta";

    expect(isBookingEditorEnabledForBusiness("alpha")).toBe(true);
    expect(isBookingEditorEnabledForBusiness("BETA")).toBe(true);
    expect(isBookingEditorEnabledForBusiness("gamma")).toBe(false);
  });
});
