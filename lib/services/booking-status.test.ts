import { describe, expect, it, vi } from "vitest";
import { promoteBookingToCompletedIfEligible } from "./booking-status";

describe("booking completion", () => {
  it("completes service work without creating or changing payment records", async () => {
    const tx = {
      booking: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, status: "ACCEPTED", customer_id: null }),
        update: vi.fn().mockResolvedValue({}),
      },
      availedService: { count: vi.fn().mockResolvedValue(0) },
      bookingPayment: { create: vi.fn() },
      customer: { updateMany: vi.fn() },
    };
    const result = await promoteBookingToCompletedIfEligible(tx as never, 1);
    expect(result).toBe(true);
    expect(tx.booking.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: "COMPLETED" } });
    expect(tx.bookingPayment.create).not.toHaveBeenCalled();
  });
});
