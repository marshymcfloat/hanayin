import { describe, expect, it } from "vitest";
import { getBookingLifecycleEventType } from "./booking-event-policy";

describe("booking lifecycle event policy", () => {
  it("does not confirm a booking when staff or an owner creates it", () => {
    expect(getBookingLifecycleEventType("BOOKING_CREATED")).toBe(
      "BOOKING_CREATED",
    );
  });

  it("confirms only after an owner approves a public booking payment", () => {
    expect(
      getBookingLifecycleEventType("PUBLIC_PAYMENT_OWNER_APPROVED"),
    ).toBe("BOOKING_CONFIRMED");
  });
});
