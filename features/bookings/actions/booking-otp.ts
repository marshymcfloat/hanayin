"use server";

import { headers } from "next/headers";
import { clientIpFromForwardedFor } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { bookingOtpInputSchema, bookingOtpVerifySchema } from "@/features/bookings/otp-schemas";
import {
  resolveCustomerTrust as resolveTrust,
  requestBookingOtp as requestOtp,
  verifyBookingOtp as verifyOtp,
} from "@/features/bookings/services/booking-otp";
import type { CustomerTrustResult, RequestOtpResult, VerifyOtpResult } from "@/features/bookings/otp-types";

async function allowAttempt(phone: string, businessSlug: string, mode: "request" | "verify") {
  const clientIp = clientIpFromForwardedFor((await headers()).get("x-forwarded-for"));
  const windowMs = mode === "verify" ? 10 * 60 * 1000 : 5 * 60 * 1000;
  const phoneLimit = await rateLimit(`otp-${mode}:phone:${phone}:${businessSlug}`, {
    windowMs, maxRequests: mode === "verify" ? 5 : 3, onStoreError: "deny",
  });
  if (!phoneLimit.success) return false;
  const ipLimit = await rateLimit(`otp-${mode}:ip:${businessSlug}:${clientIp}`, {
    windowMs, maxRequests: mode === "verify" ? 30 : 10, onStoreError: "deny",
  });
  return ipLimit.success;
}

export async function resolveCustomerTrust(phone: string, businessSlug: string): Promise<CustomerTrustResult> {
  const parsed = bookingOtpInputSchema.safeParse({ phone, businessSlug });
  if (!parsed.success) return { tier: "NEW", requiresOtp: true };
  try {
    return await resolveTrust(parsed.data.phone, parsed.data.businessSlug);
  } catch {
    return { tier: "NEW", requiresOtp: true };
  }
}

export async function requestBookingOtp(phone: string, businessSlug: string): Promise<RequestOtpResult> {
  const parsed = bookingOtpInputSchema.safeParse({ phone, businessSlug });
  if (!parsed.success) return { success: false, error: "Invalid phone or business." };
  try {
    if (!await allowAttempt(parsed.data.phone, parsed.data.businessSlug, "request")) {
      return { success: false, error: "Too many verification attempts. Please wait a few minutes.", cooldownSeconds: 300 };
    }
    return await requestOtp(parsed.data.phone, parsed.data.businessSlug);
  } catch {
    return { success: false, error: "Failed to send the verification code. Please try again in a moment." };
  }
}

export async function verifyBookingOtp(phone: string, code: string, businessSlug: string): Promise<VerifyOtpResult> {
  const parsed = bookingOtpVerifySchema.safeParse({ phone, code, businessSlug });
  if (!parsed.success) return { success: false, error: "Invalid or expired code. Please request a new one." };
  try {
    if (!await allowAttempt(parsed.data.phone, parsed.data.businessSlug, "verify")) {
      return { success: false, error: "Too many verification attempts. Please wait a few minutes." };
    }
    return await verifyOtp(parsed.data.phone, parsed.data.code, parsed.data.businessSlug);
  } catch {
    return { success: false, error: "Could not verify the code. Please try again." };
  }
}
