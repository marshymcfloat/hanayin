import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOtpVerificationProof } from "./otp-proof";
import { createBookingInDb, type BookingServiceParams } from "./booking-persistence";
import { Prisma } from "@/prisma/generated/prisma/client";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), otp: vi.fn(), booking: vi.fn(), customer: vi.fn(), payment: vi.fn(),
  publish: vi.fn(), pricing: vi.fn(), staff: vi.fn(), validate: vi.fn(),
  state: { used: false },
}));
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/services/outbox", () => ({ publishEvent: mocks.publish }));
vi.mock("./booking-pricing", () => ({ buildBookingPricingSnapshot: mocks.pricing }));
vi.mock("./booking-availability", () => ({
  BookingAvailabilityError: class extends Error {},
  validateBookingOrThrow: mocks.validate,
  resolveStaffSelectionOrThrow: mocks.staff,
  checkSaleEventSlotLimit: vi.fn(),
}));
vi.mock("./customer-matching", async (original) => ({
  ...await original<typeof import("./customer-matching")>(),
  findExistingCustomerByVerifiedPhone: vi.fn().mockResolvedValue(null),
  findExistingCustomerByContact: vi.fn().mockResolvedValue(null),
}));

const tx = {
  bookingOtpCode: { updateMany: mocks.otp },
  booking: { create: mocks.booking }, customer: { create: mocks.customer },
  bookingPayment: { create: mocks.payment },
};
const input: BookingServiceParams = {
  businessSlug: "beautyfeel", customerName: "Customer", phone: "09171234567", otpVerificationId: 7,
  services: [{ id: 1, quantity: 1 }], scheduledAt: new Date("2026-09-20T02:00:00Z"),
  estimatedEnd: new Date("2026-09-20T02:30:00Z"),
  paymentMethod: "ONLINE", paymentType: "DOWNPAYMENT", isPublicBooking: true,
};

describe("booking transaction owns OTP consumption", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BOOKING_SUCCESS_TOKEN_SECRET", "otp-unit-test-secret");
    input.otpVerificationToken = createOtpVerificationProof(7, "09171234567", "biz_1");
    mocks.state.used = false;
    mocks.transaction.mockImplementation(async (work) => {
      const before = mocks.state.used;
      try { return await work(tx); } catch (error) { mocks.state.used = before; throw error; }
    });
    mocks.otp.mockImplementation(async () => {
      if (mocks.state.used) return { count: 0 };
      mocks.state.used = true; return { count: 1 };
    });
    mocks.pricing.mockResolvedValue({
      business: { id: "biz_1", gcash_account_name: "Test", gcash_mobile_number: "09171234567" },
      services: [], estimatedEnd: input.estimatedEnd, grandTotal: 100,
      voucherDiscount: 0, voucher: null, downpaymentAmount: 20,
    });
    mocks.staff.mockResolvedValue({ assignedEmployeeId: null });
    mocks.customer.mockResolvedValue({ id: "customer_1" });
    mocks.booking.mockResolvedValue({ id: 9, hold_expires_at: new Date("2026-09-20T03:00:00Z") });
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("commits consumption, booking, payment, and outbox through the same transaction", async () => {
    await expect(createBookingInDb(input)).resolves.toMatchObject({ id: 9 });
    expect(mocks.state.used).toBe(true);
    expect(mocks.otp).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 7, business_id: "biz_1", verified: true, used: false }),
    }));
    expect(mocks.publish).toHaveBeenCalledWith(tx, expect.objectContaining({ aggregateId: "9" }));
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mocks.otp.mock.invocationCallOrder[0]).toBeLessThan(mocks.customer.mock.invocationCallOrder[0]);
    expect(mocks.payment).toHaveBeenCalledTimes(1);
  });

  it.each(["booking", "payment", "publish"] as const)("rolls back consumption when %s fails, allowing retry", async (stage) => {
    mocks[stage].mockRejectedValueOnce(new Error("write failed"));
    await expect(createBookingInDb(input)).rejects.toThrow("write failed");
    expect(mocks.state.used).toBe(false);
    await expect(createBookingInDb(input)).resolves.toMatchObject({ id: 9 });
    expect(mocks.state.used).toBe(true);
  });

  it("rejects a replay before customer, booking, or payment writes", async () => {
    mocks.state.used = true;
    await expect(createBookingInDb(input)).rejects.toThrow("OTP_INVALID_OR_EXPIRED");
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.booking).not.toHaveBeenCalled();
    expect(mocks.payment).not.toHaveBeenCalled();
  });

  it("does not consume on pricing failure", async () => {
    mocks.pricing.mockRejectedValue(new Error("invalid pricing"));
    await expect(createBookingInDb(input)).rejects.toThrow("invalid pricing");
    expect(mocks.otp).not.toHaveBeenCalled();
  });

  it.each([{ phone: undefined }, { otpVerificationId: undefined }, { otpVerificationToken: undefined }])("requires verification and phone at the persistence boundary: %j", async (missing) => {
    await expect(createBookingInDb({ ...input, ...missing })).rejects.toThrow("OTP_REQUIRED");
    expect(mocks.otp).not.toHaveBeenCalled();
    expect(mocks.booking).not.toHaveBeenCalled();
  });

  it("does not consume OTP for staff-created bookings", async () => {
    await expect(createBookingInDb({ ...input, isPublicBooking: false, otpVerificationId: undefined })).resolves.toMatchObject({ id: 9 });
    expect(mocks.otp).not.toHaveBeenCalled();
  });

  it("rejects a guessed ID with a fake proof before any mutation", async () => {
    await expect(createBookingInDb({ ...input, otpVerificationToken: "fake.signature" })).rejects.toThrow("OTP_INVALID_OR_EXPIRED");
    expect(mocks.otp).not.toHaveBeenCalled();
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.booking).not.toHaveBeenCalled();
  });

  it("runs internal hooks and outbox in the same bounded booking transaction", async () => {
    const beforeCreate = vi.fn().mockResolvedValue(undefined);
    const afterCreate = vi.fn().mockResolvedValue(undefined);
    await createBookingInDb(input, { beforeCreate, afterCreate });
    expect(beforeCreate).toHaveBeenCalledWith(tx);
    expect(afterCreate).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 9 }));
    expect(beforeCreate.mock.invocationCallOrder[0]).toBeLessThan(mocks.pricing.mock.invocationCallOrder[0]);
    expect(mocks.publish.mock.invocationCallOrder[0]).toBeLessThan(afterCreate.mock.invocationCallOrder[0]);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  });
  it("failed pre-write hook prevents all persistence and is not retried", async () => {
    const beforeCreate = vi.fn().mockRejectedValue(new Error("Forbidden"));
    await expect(createBookingInDb(input, { beforeCreate })).rejects.toThrow("Forbidden");
    expect(mocks.pricing).not.toHaveBeenCalled(); expect(mocks.booking).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("failed after-write hook rolls back consumption and only attempts once", async () => {
    const afterCreate = vi.fn().mockRejectedValue(new Error("audit write failed"));
    await expect(createBookingInDb(input, { afterCreate })).rejects.toThrow("audit write failed");
    expect(mocks.booking).toHaveBeenCalledTimes(1); expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(mocks.state.used).toBe(false); expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("retries serialization failure using a new whole transaction including both hooks", async () => {
    const beforeCreate = vi.fn().mockResolvedValue(undefined);
    const afterCreate = vi.fn().mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "7" })).mockResolvedValue(undefined);
    await expect(createBookingInDb(input, { beforeCreate, afterCreate })).resolves.toMatchObject({ id: 9 });
    expect(mocks.transaction).toHaveBeenCalledTimes(2); expect(beforeCreate).toHaveBeenCalledTimes(2);
    expect(afterCreate).toHaveBeenCalledTimes(2); expect(mocks.state.used).toBe(true);
  });
});
