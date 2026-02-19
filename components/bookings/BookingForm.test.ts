import { describe, expect, it } from "vitest";
import { getMaxBookingDate, getSlotEmptyState } from "./booking-form-utils";

describe("booking-form-utils", () => {
  it("allows future booking dates by default horizon when v2 is enabled", () => {
    const max = getMaxBookingDate({
      bookingV2Enabled: true,
      bookingHorizonDays: 14,
      now: new Date("2026-02-12T08:00:00+08:00"),
    });

    expect(max.toISOString()).toBe(
      new Date("2026-02-25T23:59:59.999+08:00").toISOString(),
    );
  });

  it("locks max booking date to today when v2 is disabled", () => {
    const max = getMaxBookingDate({
      bookingV2Enabled: false,
      bookingHorizonDays: 14,
      now: new Date("2026-02-12T08:00:00+08:00"),
    });

    expect(max.toISOString()).toBe(
      new Date("2026-02-12T23:59:59.999+08:00").toISOString(),
    );
  });

  it("shows generic empty-state message when no slots are available", () => {
    const state = getSlotEmptyState({
      isSelectedDateInFuture: false,
      bookingV2Enabled: true,
      isSelectedDateToday: true,
    });

    expect(state.title).toBe("No available slots for the selected services");
    expect(state.description).toMatch(/Try another date/i);
  });
});
