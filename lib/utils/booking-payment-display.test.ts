import { describe, expect, it } from "vitest";
import { getBookingPaymentDisplay } from "./booking-payment-display";

describe("getBookingPaymentDisplay", () => {
  it("marks full payments as paid in full", () => {
    const result = getBookingPaymentDisplay({
      grandTotal: 1000,
      amountPaid: 1000,
    });

    expect(result.grandTotal).toBe(1000);
    expect(result.amountPaid).toBe(1000);
    expect(result.remainingBalance).toBe(0);
    expect(result.paymentStatusLabel).toBe("Paid in Full");
  });

  it("marks downpayments as partially paid", () => {
    const result = getBookingPaymentDisplay({
      grandTotal: 1000,
      amountPaid: 500,
    });

    expect(result.amountPaid).toBe(500);
    expect(result.remainingBalance).toBe(500);
    expect(result.paymentStatusLabel).toBe("Partially Paid");
  });

  it("handles unpaid bookings", () => {
    const result = getBookingPaymentDisplay({
      grandTotal: 750,
      amountPaid: 0,
    });

    expect(result.amountPaid).toBe(0);
    expect(result.remainingBalance).toBe(750);
    expect(result.paymentStatusLabel).toBe("Partially Paid");
  });

  it("clamps overpaid amounts to grand total", () => {
    const result = getBookingPaymentDisplay({
      grandTotal: 600,
      amountPaid: 999,
    });

    expect(result.amountPaid).toBe(600);
    expect(result.remainingBalance).toBe(0);
  });

  it("rounds currency values to two decimals", () => {
    const result = getBookingPaymentDisplay({
      grandTotal: 1000.005,
      amountPaid: 499.994,
    });

    expect(result.grandTotal).toBe(1000.01);
    expect(result.amountPaid).toBe(499.99);
    expect(result.remainingBalance).toBe(500.02);
  });
});
