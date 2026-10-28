import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelBookingByCustomer,
  getBookingForManage,
  rescheduleBookingByCustomer,
} from "@/features/bookings/services/booking-self-serve";

const mocks = vi.hoisted(() => ({
  booking: { findFirst: vi.fn(), update: vi.fn() },
  availedService: { updateMany: vi.fn() },
  voucher: { updateMany: vi.fn() },
  transaction: vi.fn(), publish: vi.fn(), availability: vi.fn(),
}));
vi.mock("@/prisma/prisma", () => ({ prisma: {
  booking: mocks.booking, $transaction: mocks.transaction,
} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/services/outbox", () => ({ publishEvent: mocks.publish }));
vi.mock("@/features/bookings/services/booking-availability", () => ({
  validateBookingOrThrow: mocks.availability,
  BookingAvailabilityError: class extends Error {},
}));

const context = { bookingId: 12, businessSlug: "salon" };
const future = new Date("2099-01-03T10:00:00Z");
const booking = {
  id: 12, status: "ACCEPTED", scheduled_at: future, estimated_end: null,
  business_id: "biz", cancelled_at: null, reschedule_count: 0, availed_services: [],
};

describe("booking self-service use cases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    mocks.booking.findFirst.mockResolvedValue(booking);
    mocks.transaction.mockImplementation(async (work) => work({
      booking: mocks.booking, availedService: mocks.availedService, voucher: mocks.voucher,
    }));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns not found for tenant-scoped manage queries", async () => {
    mocks.booking.findFirst.mockResolvedValue(null);
    expect(await getBookingForManage(context)).toEqual({ success: false, error: "Booking not found." });
    expect(mocks.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 12, business: { slug: "salon" } },
    }));
  });

  it("retains the default cancellation reason and null event reason", async () => {
    expect(await cancelBookingByCustomer(context)).toEqual({ success: true });
    expect(mocks.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 12, business: { slug: "salon" } },
    }));
    expect(mocks.booking.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cancellation_reason: "Cancelled by customer" }),
    }));
    expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      businessId: "biz", payload: { bookingId: 12, scheduledAt: future.toISOString(), reason: null },
    }));
  });

  it("does not mistake a cancelled timestamp for an active booking", async () => {
    mocks.booking.findFirst.mockResolvedValue({ ...booking, cancelled_at: new Date() });
    expect(await cancelBookingByCustomer(context)).toEqual({ success: false, error: "This booking is already cancelled." });
    expect(mocks.booking.update).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("keeps outbox publication inside the transaction and returns safe failures", async () => {
    mocks.publish.mockRejectedValue(new Error("internal outbox failure"));
    expect(await cancelBookingByCustomer(context)).toEqual({ success: false, error: "Could not cancel the booking." });
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ booking: mocks.booking }), expect.anything());
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    [null, "Booking not found."],
    [{ ...booking, scheduled_at: null }, "This booking is too close to its appointment time to reschedule online. Please call the business."],
    [{ ...booking, cancelled_at: new Date() }, "This booking has been cancelled and cannot be rescheduled."],
  ])("rejects unavailable reschedule state without evaluating capacity", async (existing, error) => {
    mocks.booking.findFirst.mockResolvedValue(existing);
    expect(await rescheduleBookingByCustomer({ ...context, newScheduledAt: future })).toEqual({ success: false, error });
    expect(mocks.availability).not.toHaveBeenCalled();
    expect(mocks.booking.update).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
