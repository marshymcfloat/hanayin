import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { consumeOtpVerification, requestBookingOtp, verifyBookingOtp } from "./booking-otp";
import { createOtpVerificationProof } from "@/features/bookings/services/otp-proof";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  business: { findUnique: vi.fn() },
  otp: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  customer: { findFirst: vi.fn() }, transaction: vi.fn(), send: vi.fn(),
}));
vi.mock("@/prisma/prisma", () => ({ prisma: {
  business: mocks.business, bookingOtpCode: mocks.otp, $transaction: mocks.transaction,
} }));
vi.mock("@/lib/services/sms-otp", async (original) => ({
  ...await original<typeof import("@/lib/services/sms-otp")>(), sendSemaphoreOtp: mocks.send,
}));
const tx = { bookingOtpCode: mocks.otp, customer: mocks.customer } as unknown as Prisma.TransactionClient;

describe("OTP claims and sending", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BOOKING_SUCCESS_TOKEN_SECRET", "otp-unit-test-secret");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.business.findUnique.mockResolvedValue({ id: "biz_1" });
    mocks.transaction.mockImplementation(async (work) => work(tx));
    mocks.otp.findFirst.mockResolvedValue({ id: 7 });
    mocks.otp.updateMany.mockResolvedValue({ count: 1 });
    mocks.customer.findFirst.mockResolvedValue({ trust_tier: "TRUSTED", name: "Customer", email: "customer@example.test" });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("returns identity only after a tenant-scoped verification wins", async () => {
    await expect(verifyBookingOtp("09171234567", "123456", "beautyfeel")).resolves.toMatchObject({ success: true, verificationId: 7, customerName: "Customer" });
    expect(mocks.otp.updateMany).toHaveBeenCalledWith({
      where: { id: 7, phone: "639171234567", business_id: "biz_1", code: "123456",
        verified: false, used: false, expires_at: { gt: new Date() } }, data: { verified: true },
    });
    expect(mocks.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { business_id: "biz_1", phone: { in: ["639171234567", "09171234567", "9171234567"] } },
    }));
    expect(mocks.otp.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.customer.findFirst.mock.invocationCallOrder[0]);
  });

  it("rejects nonmatching records before identity lookup", async () => {
    mocks.otp.findFirst.mockResolvedValue(null);
    await expect(verifyBookingOtp("09171234567", "123456", "beautyfeel")).resolves.toMatchObject({ success: false });
    expect(mocks.otp.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { phone: "639171234567", business_id: "biz_1", code: "123456", verified: false, used: false, expires_at: { gt: new Date() } },
    }));
    expect(mocks.otp.updateMany).not.toHaveBeenCalled();
    expect(mocks.customer.findFirst).not.toHaveBeenCalled();
  });

  it("returns identity to only one concurrent verification", async () => {
    let claimed = false;
    mocks.otp.updateMany.mockImplementation(async () => {
      if (claimed) return { count: 0 };
      claimed = true; return { count: 1 };
    });
    const results = await Promise.all([
      verifyBookingOtp("09171234567", "123456", "beautyfeel"),
      verifyBookingOtp("09171234567", "123456", "beautyfeel"),
    ]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(mocks.customer.findFirst).toHaveBeenCalledTimes(1);
    expect(results.find((r) => !r.success)).not.toHaveProperty("customerName");
  });

  it("propagates identity lookup failure within the transaction", async () => {
    mocks.customer.findFirst.mockRejectedValue(new Error("lookup failed"));
    await expect(verifyBookingOtp("09171234567", "123456", "beautyfeel")).rejects.toThrow("lookup failed");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("consumes through the supplied transaction without a pre-read or global client", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const isolatedTx = { bookingOtpCode: { updateMany } } as unknown as Prisma.TransactionClient;
    await expect(consumeOtpVerification(isolatedTx, 7, "+639171234567", "biz_1", createOtpVerificationProof(7, "09171234567", "biz_1"))).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 7, business_id: "biz_1", phone: { in: ["639171234567", "09171234567", "9171234567"] },
        verified: true, used: false, expires_at: { gt: new Date() } }, data: { used: true },
    });
    expect(mocks.otp.updateMany).not.toHaveBeenCalled();
    expect(mocks.otp.findFirst).not.toHaveBeenCalled();
  });

  it.each([0, 2])("rejects consumption unless exactly one row changed: %i", async (count) => {
    mocks.otp.updateMany.mockResolvedValue({ count });
    await expect(consumeOtpVerification(tx, 7, "09171234567", "biz_1", createOtpVerificationProof(7, "09171234567", "biz_1"))).resolves.toBe(false);
  });

  it("only one consume call can win", async () => {
    let used = false;
    mocks.otp.updateMany.mockImplementation(async () => {
      if (used) return { count: 0 };
      used = true; return { count: 1 };
    });
    expect(await Promise.all([
      consumeOtpVerification(tx, 7, "09171234567", "biz_1", createOtpVerificationProof(7, "09171234567", "biz_1")),
      consumeOtpVerification(tx, 7, "09171234567", "biz_1", createOtpVerificationProof(7, "09171234567", "biz_1")),
    ])).toEqual([true, false]);
  });

  it("enforces the existing SMS cooldown", async () => {
    mocks.otp.findFirst.mockResolvedValue({ created_at: new Date(Date.now() - 20000) });
    await expect(requestBookingOtp("09171234567", "beautyfeel")).resolves.toMatchObject({ success: false, cooldownSeconds: 40 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("persists provider codes with tenant and ten-minute expiry outside a transaction", async () => {
    mocks.otp.findFirst.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ code: "123456", messageId: "message_1" });
    await expect(requestBookingOtp("09171234567", "beautyfeel")).resolves.toEqual({ success: true });
    expect(mocks.otp.create).toHaveBeenCalledWith({ data: {
      phone: "639171234567", business_id: "biz_1", code: "123456",
      semaphore_message_id: "message_1", expires_at: new Date(Date.now() + 600000),
    } });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not persist or leak provider errors after send failure", async () => {
    mocks.otp.findFirst.mockResolvedValue(null);
    mocks.send.mockRejectedValue(new Error("secret provider details"));
    await expect(requestBookingOtp("09171234567", "beautyfeel")).resolves.toEqual({
      success: false, error: "Failed to send the verification code. Please try again in a moment.",
    });
    expect(mocks.otp.create).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[booking-otp] Failed to send or persist verification code.");
  });

  it("rejects a missing business before any claim or send", async () => {
    mocks.business.findUnique.mockResolvedValue(null);
    await expect(verifyBookingOtp("09171234567", "123456", "missing")).resolves.toMatchObject({ success: false });
    await expect(requestBookingOtp("09171234567", "missing")).resolves.toMatchObject({ success: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("verifies new customers without disclosing nonexistent identity", async () => {
    mocks.customer.findFirst.mockResolvedValue(null);
    await expect(verifyBookingOtp("09171234567", "123456", "beautyfeel")).resolves.toEqual({
      success: true, verificationId: 7, verificationToken: expect.any(String), customerTier: "NEW",
      customerName: undefined, customerEmail: undefined,
    });
  });

  it("stores a code without a provider ID and safely handles persistence failure", async () => {
    mocks.otp.findFirst.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ code: "123456", messageId: "" });
    mocks.otp.create.mockRejectedValue(new Error("DB details"));
    await expect(requestBookingOtp("09171234567", "beautyfeel")).resolves.toMatchObject({ success: false });
    expect(mocks.otp.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ semaphore_message_id: null }),
    }));
  });

  it("does not complete verification when proof signing fails", async () => {
    vi.stubEnv("BOOKING_SUCCESS_TOKEN_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    await expect(verifyBookingOtp("09171234567", "123456", "beautyfeel")).rejects.toThrow("must be configured");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
