import { expect, test, describe } from "vitest";
import { calculateBookingTotal } from "@/lib/utils/pricing";

describe("calculateBookingTotal", () => {
  test("calculates simple full cash payment correctly", () => {
    const total = calculateBookingTotal({
      subtotal: 100,
      paymentMethod: "CASH",
      paymentType: "FULL",
    });
    expect(total).toBe(100);
  });

  test("calculates simple downpayment cash correctly", () => {
    const total = calculateBookingTotal({
      subtotal: 100,
      paymentMethod: "CASH",
      paymentType: "DOWNPAYMENT",
    });
    expect(total).toBe(50);
  });

  test("ONLINE payment has no convenience fee", () => {
    const total = calculateBookingTotal({
      subtotal: 100,
      paymentMethod: "ONLINE",
      paymentType: "FULL",
    });
    expect(total).toBe(100);
  });

  test("ONLINE downpayment has no convenience fee", () => {
    const total = calculateBookingTotal({
      subtotal: 100,
      paymentMethod: "ONLINE",
      paymentType: "DOWNPAYMENT",
    });
    expect(total).toBe(50);
  });

  test("applies voucher discount before calculation", () => {
    const total = calculateBookingTotal({
      subtotal: 100,
      voucherDiscount: 20,
      paymentMethod: "CASH",
      paymentType: "FULL",
    });
    expect(total).toBe(80);
  });

  test("prevents negative total with large voucher", () => {
    const total = calculateBookingTotal({
      subtotal: 50,
      voucherDiscount: 100,
      paymentMethod: "CASH",
      paymentType: "FULL",
    });
    expect(total).toBe(0);
  });
});
