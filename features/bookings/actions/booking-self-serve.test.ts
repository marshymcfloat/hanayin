import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelBookingByCustomerAction,
  getBookingForManageAction,
  rescheduleBookingByCustomerAction,
} from "@/features/bookings/actions/booking-self-serve";
import { BookingAvailabilityError } from "@/features/bookings/services/booking-availability";

const mocks = vi.hoisted(() => ({
  booking: { findFirst: vi.fn(), update: vi.fn() },
  availedService: { updateMany: vi.fn() },
  voucher: { updateMany: vi.fn() },
  transaction: vi.fn(), token: vi.fn(), limiter: vi.fn(), invalidate: vi.fn(),
  publish: vi.fn(), availability: vi.fn(), headers: vi.fn(),
}));
vi.mock("@/prisma/prisma", () => ({ prisma: {
  booking: mocks.booking, $transaction: mocks.transaction,
} }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.invalidate }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.limiter }));
vi.mock("@/lib/security/booking-success-token", () => ({ verifyBookingSuccessToken: mocks.token }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/services/outbox", () => ({ publishEvent: mocks.publish }));
vi.mock("@/features/bookings/services/booking-availability", () => ({
  validateBookingOrThrow: mocks.availability,
  resolveStaffSelectionOrThrow: vi.fn(),
  BookingAvailabilityError: class extends Error {
    constructor(_code: string, message: string) { super(message); }
  },
}));

const input = { token: "signed-token", bookingId: 12, businessSlug: "salon" };
const nextSlot = new Date("2030-01-04T10:00:00Z");
const existing = {
  id: 12, status: "ACCEPTED", scheduled_at: new Date("2030-01-03T10:00:00Z"),
  estimated_end: null, business_id: "biz", cancelled_at: null, reschedule_count: 1,
  availed_services: [{ id: 1, service_id: 4, service: { duration: 45, name: "Cut" } },
    { id: 2, service_id: 5, service: null }],
  business: { name: "Salon", slug: "salon" }, customer: null, customer_label: "Guest",
  grand_total: 100, amount_paid: null, payment_status: "UNPAID",
};

describe("customer booking self-service contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    mocks.token.mockReturnValue(true);
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.1" }));
    mocks.limiter.mockResolvedValue({ success: true });
    mocks.booking.findFirst.mockResolvedValue(existing);
    mocks.transaction.mockImplementation(async (work) => work({
      booking: mocks.booking, availedService: mocks.availedService, voucher: mocks.voucher,
    }));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("verifies manage purpose before reading tenant-scoped booking data", async () => {
    mocks.token.mockReturnValue(false);
    expect(await getBookingForManageAction(input)).toEqual({ success: false, error: "Invalid or expired link." });
    expect(mocks.token).toHaveBeenCalledWith({ ...input, purpose: "manage" });
    expect(mocks.booking.findFirst).not.toHaveBeenCalled();
  });

  it("projects only the customer-facing booking fields", async () => {
    const result = await getBookingForManageAction(input);
    expect(result).toEqual({ success: true, booking: {
      bookingId: 12, businessSlug: "salon", businessName: "Salon",
      scheduledAt: "2030-01-03T10:00:00.000Z", estimatedEnd: null,
      totalPrice: 100, paymentStatus: "UNPAID", amountPaid: 0,
      serviceNames: ["Cut"], serviceIds: [4, 5], customerName: "Guest",
      status: "ACCEPTED", cancelled: false, rescheduleCount: 1, window: "free",
    } });
    expect(mocks.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 12, business: { slug: "salon" } },
    }));
  });

  it("maps manage read failures to a fixed safe error", async () => {
    mocks.booking.findFirst.mockRejectedValue(new Error("internal SQL connection failure"));
    expect(await getBookingForManageAction(input)).toEqual({ success: false, error: "Could not load the booking." });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it.each(["cancel", "reschedule"])("rate limits %s attempts before token rejection", async (action) => {
    mocks.token.mockReturnValue(false);
    const result = action === "cancel" ? await cancelBookingByCustomerAction(input)
      : await rescheduleBookingByCustomerAction({ ...input, newScheduledAt: nextSlot });
    expect(result.success).toBe(false);
    expect(mocks.limiter.mock.calls).toEqual([
      [`self-serve:${action}:booking:12`, { windowMs: 3600000, maxRequests: 5 }],
      [`self-serve:${action}:ip:203.0.113.1`, { windowMs: 3600000, maxRequests: 30 }],
    ]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("retains rejected-promise behavior for exhausted booking rate limits", async () => {
    mocks.limiter.mockResolvedValue({ success: false });
    await expect(cancelBookingByCustomerAction(input)).rejects.toThrow("Too many attempts");
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.limiter).toHaveBeenCalledTimes(1);
  });

  it("cancels active services, restores vouchers and publishes atomically before invalidating", async () => {
    const reason = "a".repeat(250);
    expect(await cancelBookingByCustomerAction({ ...input, reason })).toEqual({ success: true });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mocks.booking.update).toHaveBeenCalledWith({ where: { id: 12 }, data: {
      status: "CANCELLED", cancelled_at: new Date(), cancelled_by_customer: true,
      cancellation_reason: reason.slice(0, 200),
    } });
    expect(mocks.availedService.updateMany).toHaveBeenCalledWith({ where: {
      booking_id: 12, status: { in: ["PENDING", "CLAIMED", "SERVING"] },
    }, data: { status: "CANCELLED", cancelled_at: new Date() } });
    expect(mocks.voucher.updateMany).toHaveBeenCalledWith({ where: { used_by_id: 12 }, data: { used_by_id: null, is_active: true } });
    expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      type: "BOOKING_CANCELLED_BY_CUSTOMER", businessId: "biz", payload: {
        bookingId: 12, scheduledAt: existing.scheduled_at.toISOString(), reason,
      },
    }));
    expect(mocks.invalidate.mock.calls).toEqual([["/salon/booking/manage"], ["/app/salon/bookings"]]);
    expect(mocks.publish.mock.invocationCallOrder[0]).toBeLessThan(mocks.invalidate.mock.invocationCallOrder[0]);
  });

  it.each([
    [null, "Booking not found."],
    [{ ...existing, status: "CANCELLED" }, "This booking is already cancelled."],
    [{ ...existing, scheduled_at: new Date("2030-01-01T06:00:00Z") }, "This booking is too close to its appointment time to cancel online. Please call the business."],
  ])("rejects cancellation stale state without writes", async (booking, error) => {
    mocks.booking.findFirst.mockResolvedValue(booking);
    expect(await cancelBookingByCustomerAction(input)).toEqual({ success: false, error });
    expect(mocks.booking.update).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("reschedules in a serializable transaction using regular availability and resets only pending/claimed services", async () => {
    expect(await rescheduleBookingByCustomerAction({ ...input, newScheduledAt: nextSlot })).toEqual({ success: true });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mocks.availability).toHaveBeenCalledWith(expect.objectContaining({
      businessSlug: "salon", scheduledAt: nextSlot, services: [{ id: 4, quantity: 1 }, { id: 5, quantity: 1 }],
      paymentType: "FULL", isPublicBooking: true, db: expect.anything(),
    }));
    expect(mocks.availedService.updateMany).toHaveBeenCalledWith({ where: {
      booking_id: 12, status: { in: ["PENDING", "CLAIMED"] },
    }, data: {
      scheduled_at: nextSlot, estimated_end: new Date("2030-01-04T11:15:00Z"),
      served_by_id: null, claimed_at: null, status: "PENDING",
    } });
    expect(mocks.booking.update).toHaveBeenCalledWith({ where: { id: 12 }, data: {
      scheduled_at: nextSlot, estimated_end: new Date("2030-01-04T11:15:00Z"),
      rescheduled_at: new Date(), reschedule_count: { increment: 1 },
    } });
    expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      type: "BOOKING_RESCHEDULED_BY_CUSTOMER", businessId: "biz", payload: {
        bookingId: 12, previousScheduledAt: existing.scheduled_at.toISOString(), newScheduledAt: nextSlot.toISOString(),
      },
    }));
  });

  it.each(["HOLD", "COMPLETED", "CANCELLED"])("rejects rescheduling %s booking state", async (status) => {
    mocks.booking.findFirst.mockResolvedValue({ ...existing, status });
    expect((await rescheduleBookingByCustomerAction({ ...input, newScheduledAt: nextSlot })).success).toBe(false);
    expect(mocks.availability).not.toHaveBeenCalled();
    expect(mocks.booking.update).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("returns useful availability errors without mutations or invalidation", async () => {
    mocks.availability.mockRejectedValue(new BookingAvailabilityError("SLOT_JUST_TAKEN", "SLOT_JUST_TAKEN"));
    expect(await rescheduleBookingByCustomerAction({ ...input, newScheduledAt: nextSlot })).toEqual({ success: false, error: "SLOT_JUST_TAKEN" });
    expect(mocks.booking.update).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("does not retry transaction failures or leak internal errors", async () => {
    mocks.transaction.mockRejectedValue(new Error("internal database failure"));
    expect(await rescheduleBookingByCustomerAction({ ...input, newScheduledAt: nextSlot })).toEqual({ success: false, error: "Could not reschedule the booking." });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("returns a safe cancellation conflict without retry or invalidation", async () => {
    mocks.transaction.mockRejectedValue(Object.assign(new Error("write conflict"), { code: "P2034" }));
    expect(await cancelBookingByCustomerAction(input)).toEqual({ success: false, error: "Could not cancel the booking." });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it.each(["cancel", "reschedule"])("maps %s invalidation failures to the existing safe error", async (action) => {
    mocks.invalidate.mockImplementation(() => { throw new Error("cache unavailable"); });
    const result = action === "cancel" ? await cancelBookingByCustomerAction(input)
      : await rescheduleBookingByCustomerAction({ ...input, newScheduledAt: nextSlot });
    expect(result).toEqual({ success: false, error: `Could not ${action} the booking.` });
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed manage credentials before token verification or persistence", async () => {
    expect(await getBookingForManageAction({ ...input, bookingId: -1 })).toEqual({ success: false, error: "Invalid or expired link." });
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.booking.findFirst).not.toHaveBeenCalled();
  });

  it("rejects invalid reschedule dates without entering availability or a transaction", async () => {
    expect(await rescheduleBookingByCustomerAction({ ...input, newScheduledAt: new Date("invalid") })).toEqual({ success: false, error: "Could not reschedule the booking." });
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.availability).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
