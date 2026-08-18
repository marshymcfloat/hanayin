import { describe, expect, it } from "vitest";
import { deriveBookingPaymentStage } from "./booking-payment-stage";

describe("deriveBookingPaymentStage", () => {
  it.each([
    [{ status: "HOLD", payments: [{ status: "PENDING", submitted_at: null }] }, "AWAITING_PAYMENT"],
    [{ status: "HOLD", payments: [{ status: "PENDING", submitted_at: new Date() }] }, "AWAITING_VERIFICATION"],
    [{ status: "HOLD", payments: [{ status: "PENDING", submitted_at: new Date(), escalated_at: new Date() }] }, "NEEDS_RESOLUTION"],
    [{ status: "ACCEPTED", payments: [{ status: "SUCCEEDED", submitted_at: new Date() }] }, "CONFIRMED"],
    [{ status: "CANCELLED", payments: [{ status: "FAILED", submitted_at: new Date() }] }, "REJECTED"],
    [{ status: "CANCELLED", payments: [{ status: "EXPIRED", submitted_at: new Date() }] }, "EXPIRED"],
  ] as const)("derives %s", (booking, expected) => {
    expect(deriveBookingPaymentStage(booking)).toBe(expected);
  });
});
