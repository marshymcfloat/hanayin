import "server-only";
import { normalizePhilippinePhone } from "@/lib/services/sms-otp";
import { createBookingSuccessToken, verifyBookingSuccessToken } from "@/lib/security/booking-success-token";

// Reuse the booking signer with a distinct purpose and collision-safe OTP scope.
function otpScope(businessId: string, phone: string) {
  return JSON.stringify([businessId, normalizePhilippinePhone(phone)]);
}

export function createOtpVerificationProof(id: number, phone: string, businessId: string) {
  return createBookingSuccessToken({
    bookingId: id, businessSlug: otpScope(businessId, phone), purpose: "otp", ttlSeconds: 600,
  });
}

export function verifyOtpVerificationProof(token: string, id: number, phone: string, businessId: string) {
  if (!token || token.length > 1024 || token.split(".").length !== 2) return false;
  return verifyBookingSuccessToken({
    token, bookingId: id, businessSlug: otpScope(businessId, phone), purpose: "otp",
  });
}
