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
  const scope = { businessId: "tenant-a", booking: { business_id: "tenant-a", status: "ACCEPTED" as const, cancelled_at: null, customer_id: "customer-a" } };
  function transaction(booking: { id: number; status: string; customer_id: string | null } | null = { id: 1, status: "ACCEPTED", customer_id: "customer-a" }) {
    return { booking: { findUnique: vi.fn().mockResolvedValue(booking), findFirst: vi.fn().mockResolvedValue(booking), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, availedService: { count: vi.fn().mockResolvedValue(0) }, customer: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, bookingPayment: { create: vi.fn() } };
  }
  it.each([null, { id: 1, status: "CANCELLED", customer_id: null }, { id: 1, status: "COMPLETED", customer_id: null }])("preserves terminal/missing legacy no-ops %j", async booking => {
    const tx = transaction(booking);
    expect(await promoteBookingToCompletedIfEligible(tx as never, 1)).toBe(false);
    expect(tx.availedService.count).not.toHaveBeenCalled(); expect(tx.booking.update).not.toHaveBeenCalled(); expect(tx.customer.updateMany).not.toHaveBeenCalled();
  });
  it.each([false, true])("does not complete a parent with remaining services (scoped=%s)", async scoped => {
    const tx = transaction(); tx.availedService.count.mockResolvedValue(1);
    expect(await promoteBookingToCompletedIfEligible(tx as never, 1, scoped ? scope : undefined)).toBe(false);
    expect(tx.booking.update).not.toHaveBeenCalled(); expect(tx.booking.updateMany).not.toHaveBeenCalled(); expect(tx.customer.updateMany).not.toHaveBeenCalled();
    expect(tx.availedService.count.mock.calls[0][0].where.status).toEqual({ notIn: ["COMPLETED", "CANCELLED"] });
  });
  it("retains the legacy NEW→TRUSTED update without changing payment data", async () => {
    const tx = transaction();
    expect(await promoteBookingToCompletedIfEligible(tx as never, 1)).toBe(true);
    expect(tx.customer.updateMany).toHaveBeenCalledWith({ where: { id: "customer-a", trust_tier: "NEW" }, data: { trust_tier: "TRUSTED" } });
    expect(tx.bookingPayment.create).not.toHaveBeenCalled(); expect(tx.booking.findFirst).not.toHaveBeenCalled();
  });
  it("scopes lookup, remaining services, parent snapshot and customer promotion to verified tenant", async () => {
    const tx = transaction();
    expect(await promoteBookingToCompletedIfEligible(tx as never, 1, scope)).toBe(true);
    expect(tx.booking.findFirst).toHaveBeenCalledWith({ where: { id: 1, business_id: "tenant-a", AND: [scope.booking] }, select: { id: true, status: true, customer_id: true } });
    expect(tx.availedService.count).toHaveBeenCalledWith({ where: { booking_id: 1, booking: { business_id: "tenant-a", AND: [scope.booking] }, status: { notIn: ["COMPLETED", "CANCELLED"] } } });
    expect(tx.booking.updateMany).toHaveBeenCalledWith({ where: { id: 1, business_id: "tenant-a", status: "ACCEPTED", customer_id: "customer-a", AND: [scope.booking] }, data: { status: "COMPLETED" } });
    expect(tx.customer.updateMany).toHaveBeenCalledWith({ where: { id: "customer-a", business_id: "tenant-a", trust_tier: "NEW" }, data: { trust_tier: "TRUSTED" } });
    expect(tx.booking.findUnique).not.toHaveBeenCalled(); expect(tx.booking.update).not.toHaveBeenCalled(); expect(tx.bookingPayment.create).not.toHaveBeenCalled();
  });
  it("scopes anonymous completion without a customer update", async () => {
    const tx = transaction({ id: 1, status: "ACCEPTED", customer_id: null });
    expect(await promoteBookingToCompletedIfEligible(tx as never, 1, { ...scope, booking: { ...scope.booking, customer_id: null } })).toBe(true);
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
  });
  it("throws on stale scoped parent lookup or mutation so the caller rolls back", async () => {
    const missing = transaction(null);
    await expect(promoteBookingToCompletedIfEligible(missing as never, 1, scope)).rejects.toThrow("snapshot changed");
    expect(missing.availedService.count).not.toHaveBeenCalled();
    const stale = transaction(); stale.booking.updateMany.mockResolvedValue({ count: 0 });
    await expect(promoteBookingToCompletedIfEligible(stale as never, 1, scope)).rejects.toThrow("snapshot changed");
    expect(stale.customer.updateMany).not.toHaveBeenCalled();
  });
  it.each(["count", "parent", "customer"])("propagates %s failures to preserve outer rollback", async operation => {
    const tx = transaction();
    const failing = operation === "count" ? tx.availedService.count : operation === "parent" ? tx.booking.updateMany : tx.customer.updateMany;
    failing.mockRejectedValueOnce(new Error("fixture failure"));
    await expect(promoteBookingToCompletedIfEligible(tx as never, 1, scope)).rejects.toThrow("fixture failure");
  });
});
