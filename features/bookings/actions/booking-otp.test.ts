import { beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "./booking-otp";
import { bookingOtpVerifySchema } from "../otp-schemas";

const mocks = vi.hoisted(() => ({
  rate: vi.fn(), headers: vi.fn(), request: vi.fn(), verify: vi.fn(), trust: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rate }));
vi.mock("@/features/bookings/services/booking-otp", () => ({
  requestBookingOtp: mocks.request, verifyBookingOtp: mocks.verify, resolveCustomerTrust: mocks.trust,
}));

describe("OTP public boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mocks.rate.mockResolvedValue({ success: true });
    mocks.verify.mockResolvedValue({ success: true, verificationId: 7 });
    mocks.request.mockResolvedValue({ success: true });
  });

  it("does not expose consumption as a remote action", () => {
    expect(Object.keys(actions).sort()).toEqual(["requestBookingOtp", "resolveCustomerTrust", "verifyBookingOtp"]);
  });

  it.each(["09171234567", "+63 917 123 4567", "9171234567"])("normalizes phone %s before limits and lookup", async (phone) => {
    await expect(actions.verifyBookingOtp(phone, " 123456 ", "beautyfeel")).resolves.toEqual({ success: true, verificationId: 7 });
    expect(mocks.verify).toHaveBeenCalledWith("639171234567", "123456", "beautyfeel");
    expect(mocks.rate).toHaveBeenNthCalledWith(1, "otp-verify:phone:639171234567:beautyfeel", {
      windowMs: 600000, maxRequests: 5, onStoreError: "deny",
    });
    expect(mocks.rate).toHaveBeenNthCalledWith(2, "otp-verify:ip:beautyfeel:203.0.113.10", {
      windowMs: 600000, maxRequests: 30, onStoreError: "deny",
    });
  });

  it.each([
    { phone: null, code: "123456", businessSlug: "beautyfeel" },
    { phone: "09171234567", code: "12345", businessSlug: "beautyfeel" },
    { phone: "09171234567", code: "abcdef", businessSlug: "beautyfeel" },
    { phone: "09171234567", code: "123456", businessSlug: "../other" },
    { phone: "11111111111", code: "123456", businessSlug: "beautyfeel" },
  ])("rejects malformed input before limiter or lookup: %j", async (input) => {
    expect(bookingOtpVerifySchema.safeParse(input).success).toBe(false);
    await expect(actions.verifyBookingOtp(input.phone as string, input.code, input.businessSlug)).resolves.toMatchObject({ success: false });
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it.each([1, 2])("denies verification when limiter %i is exhausted", async (bucket) => {
    if (bucket === 2) mocks.rate.mockResolvedValueOnce({ success: true });
    mocks.rate.mockResolvedValueOnce({ success: false });
    await expect(actions.verifyBookingOtp("09171234567", "123456", "beautyfeel")).resolves.toMatchObject({ success: false, error: expect.stringContaining("Too many") });
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("fails closed on limiter failure without exposing errors", async () => {
    mocks.rate.mockRejectedValue(new Error("sensitive provider details"));
    await expect(actions.verifyBookingOtp("09171234567", "123456", "beautyfeel")).resolves.toEqual({ success: false, error: "Could not verify the code. Please try again." });
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("returns a safe error on persistence failure", async () => {
    mocks.verify.mockRejectedValue(new Error("SQL details"));
    await expect(actions.verifyBookingOtp("09171234567", "123456", "beautyfeel")).resolves.toEqual({ success: false, error: "Could not verify the code. Please try again." });
  });

  it("preserves send limits separately from verification", async () => {
    await actions.requestBookingOtp("09171234567", "beautyfeel");
    expect(mocks.request).toHaveBeenCalledWith("639171234567", "beautyfeel");
    expect(mocks.rate).toHaveBeenNthCalledWith(1, "otp-request:phone:639171234567:beautyfeel", expect.objectContaining({ maxRequests: 3 }));
    expect(mocks.rate).toHaveBeenNthCalledWith(2, "otp-request:ip:beautyfeel:203.0.113.10", expect.objectContaining({ maxRequests: 10 }));
  });

  it("rejects send spam and invalid phones without sending", async () => {
    mocks.rate.mockResolvedValue({ success: false });
    await expect(actions.requestBookingOtp("09171234567", "beautyfeel")).resolves.toMatchObject({ success: false, cooldownSeconds: 300 });
    await expect(actions.requestBookingOtp("not-a-phone", "beautyfeel")).resolves.toMatchObject({ success: false });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("withholds identity and requires OTP on trust lookup failure", async () => {
    mocks.trust.mockRejectedValue(new Error("SQL details"));
    await expect(actions.resolveCustomerTrust("09171234567", "beautyfeel")).resolves.toEqual({ tier: "NEW", requiresOtp: true });
  });

  it("validates trust input before lookup and passes valid input to the service", async () => {
    await expect(actions.resolveCustomerTrust("bad-phone", "beautyfeel")).resolves.toEqual({ tier: "NEW", requiresOtp: true });
    expect(mocks.trust).not.toHaveBeenCalled();
    mocks.trust.mockResolvedValue({ tier: "TRUSTED", requiresOtp: true });
    await expect(actions.resolveCustomerTrust("09171234567", "beautyfeel")).resolves.toEqual({ tier: "TRUSTED", requiresOtp: true });
    expect(mocks.trust).toHaveBeenCalledWith("639171234567", "beautyfeel");
  });

  it("returns safe send errors when request infrastructure fails", async () => {
    mocks.request.mockRejectedValue(new Error("secret details"));
    await expect(actions.requestBookingOtp("09171234567", "beautyfeel")).resolves.toEqual({
      success: false, error: "Failed to send the verification code. Please try again in a moment.",
    });
  });
});
