import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOtpVerificationProof, verifyOtpVerificationProof } from "./otp-proof";
import { createBookingSuccessToken, verifyBookingSuccessToken } from "@/lib/security/booking-success-token";

describe("OTP signed ownership proof", () => {
  beforeEach(() => {
    vi.stubEnv("BOOKING_SUCCESS_TOKEN_SECRET", "otp-proof-test-secret");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
  it("binds proof to verification ID, canonical phone, business, and OTP purpose", () => {
    const token = createOtpVerificationProof(7, "09171234567", "biz_1");
    expect(verifyOtpVerificationProof(token, 7, "+639171234567", "biz_1")).toBe(true);
    expect(verifyOtpVerificationProof(token, 8, "09171234567", "biz_1")).toBe(false);
    expect(verifyOtpVerificationProof(token, 7, "09171234568", "biz_1")).toBe(false);
    expect(verifyOtpVerificationProof(token, 7, "09171234567", "biz_2")).toBe(false);
    expect(verifyBookingSuccessToken({ token, bookingId: 7, businessSlug: JSON.stringify(["biz_1", "639171234567"]), purpose: "manage" })).toBe(false);
  });
  it.each(["success", "details", "manage"] as const)("rejects a valid %s token as OTP proof", (purpose) => {
    const token = createBookingSuccessToken({ bookingId: 7, businessSlug: JSON.stringify(["biz_1", "639171234567"]), purpose });
    expect(verifyOtpVerificationProof(token, 7, "09171234567", "biz_1")).toBe(false);
  });
  it("rejects proof at the exact expiration boundary", () => {
    const token = createOtpVerificationProof(7, "09171234567", "biz_1");
    vi.advanceTimersByTime(600000);
    expect(verifyOtpVerificationProof(token, 7, "09171234567", "biz_1")).toBe(false);
  });
  it("rejects malformed, tampered, extended, and oversized tokens", () => {
    const token = createOtpVerificationProof(7, "09171234567", "biz_1");
    for (const invalid of ["", "guessed", "bad.signature", token + ".extra", "a".repeat(1025)]) {
      expect(verifyOtpVerificationProof(invalid, 7, "09171234567", "biz_1")).toBe(false);
    }
    const [body, signature] = token.split(".");
    const modified = Buffer.from(JSON.stringify({ bookingId: 8 }), "utf8").toString("base64url");
    expect(verifyOtpVerificationProof(modified + "." + signature, 8, "09171234567", "biz_1")).toBe(false);
    expect(verifyOtpVerificationProof(body + ".wrong", 7, "09171234567", "biz_1")).toBe(false);
  });
  it("fails closed when no signer secret is configured", () => {
    vi.stubEnv("BOOKING_SUCCESS_TOKEN_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(() => createOtpVerificationProof(7, "09171234567", "biz_1")).toThrow("must be configured");
  });
});
