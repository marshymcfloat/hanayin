"use server";

import { prisma } from "@/prisma/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import {
  sendSemaphoreOtp,
  normalizePhilippinePhone,
} from "@/lib/services/sms-otp";

const OTP_EXPIRY_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 60;

export type CustomerTrust = "NEW" | "TRUSTED" | "RESTRICTED";

export interface CustomerTrustResult {
  tier: CustomerTrust;
  requiresOtp: boolean;
  customerName?: string;
  customerEmail?: string;
}

/**
 * Resolves the trust tier for a phone number without sending an OTP.
 * Use this on phone entry to decide whether to show the OTP step.
 *
 * - TRUSTED  → customer has ≥1 completed booking with 0 no-shows → skip OTP
 * - RESTRICTED → customer has ≥2 no-shows → block, show "contact us"
 * - NEW       → no prior history → OTP required
 */
export async function resolveCustomerTrust(
  phone: string,
  businessSlug: string,
): Promise<CustomerTrustResult> {
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true },
  });

  if (!business) return { tier: "NEW", requiresOtp: true };

  const normalizedPhone = normalizePhilippinePhone(phone);
  // Also check the local 09XX format in case it was stored that way
  const localPhone =
    normalizedPhone.startsWith("63") && normalizedPhone.length === 12
      ? "0" + normalizedPhone.slice(2)
      : normalizedPhone;

  const customer = await prisma.customer.findFirst({
    where: {
      business_id: business.id,
      phone: { in: [normalizedPhone, localPhone] },
    },
    select: { trust_tier: true, name: true, no_show_count: true, email: true },
  });

  if (!customer) return { tier: "NEW", requiresOtp: true };

  const tier = (customer.trust_tier as CustomerTrust) ?? "NEW";

  return {
    tier,
    requiresOtp: tier !== "TRUSTED",
    customerName: customer.name,
    customerEmail: customer.email ?? undefined,
  };
}

export interface RequestOtpResult {
  success: boolean;
  error?: string;
  cooldownSeconds?: number;
}

/**
 * Sends an OTP via Semaphore to the given phone number.
 * Rate-limited: max 3 OTPs per phone per 5 minutes.
 * Enforces a 60-second cooldown between consecutive sends.
 */
export async function requestBookingOtp(
  phone: string,
  businessSlug: string,
): Promise<RequestOtpResult> {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for") ?? "";
  const clientIp = forwardedFor.split(",")[0]?.trim() ?? "unknown";

  const limiter = await rateLimit(
    `otp-request:${normalizePhilippinePhone(phone)}:${businessSlug}:${clientIp}`,
    { windowMs: 5 * 60 * 1000, maxRequests: 3 },
  );

  if (!limiter.success) {
    return {
      success: false,
      error: "Too many verification attempts. Please wait a few minutes.",
      cooldownSeconds: 300,
    };
  }

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true },
  });

  if (!business) return { success: false, error: "Business not found." };

  const normalizedPhone = normalizePhilippinePhone(phone);

  // Enforce per-number cooldown
  const recent = await prisma.bookingOtpCode.findFirst({
    where: {
      phone: normalizedPhone,
      business_id: business.id,
      used: false,
      created_at: {
        gte: new Date(Date.now() - OTP_COOLDOWN_SECONDS * 1000),
      },
    },
    orderBy: { created_at: "desc" },
  });

  if (recent) {
    const secondsLeft = Math.ceil(
      (recent.created_at.getTime() + OTP_COOLDOWN_SECONDS * 1000 - Date.now()) /
        1000,
    );
    return {
      success: false,
      error: `Please wait ${secondsLeft}s before requesting a new code.`,
      cooldownSeconds: secondsLeft,
    };
  }

  // Invalidate any outstanding (unverified) codes for this number+business
  await prisma.bookingOtpCode.updateMany({
    where: {
      phone: normalizedPhone,
      business_id: business.id,
      verified: false,
      used: false,
    },
    data: { used: true },
  });

  try {
    const { code, messageId } = await sendSemaphoreOtp(normalizedPhone);
    console.log("[booking-otp] OTP sent", { messageId, phone: normalizedPhone.slice(0, 6) + "****" });

    await prisma.bookingOtpCode.create({
      data: {
        phone: normalizedPhone,
        business_id: business.id,
        code,
        semaphore_message_id: messageId || null,
        expires_at: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[booking-otp] Semaphore send failed:", error);
    return {
      success: false,
      error:
        "Failed to send the verification code. Please try again in a moment.",
    };
  }
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  verificationId?: number;
  customerTier?: CustomerTrust;
  customerName?: string;
  customerEmail?: string;
}

/**
 * Verifies an OTP code entered by the customer.
 * Marks the OTP as `verified` so it can be consumed on booking creation.
 * Does NOT mark it as `used` yet — that happens in createBooking.
 */
export async function verifyBookingOtp(
  phone: string,
  code: string,
  businessSlug: string,
): Promise<VerifyOtpResult> {
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true },
  });

  if (!business) return { success: false, error: "Business not found." };

  const normalizedPhone = normalizePhilippinePhone(phone);

  const otpRecord = await prisma.bookingOtpCode.findFirst({
    where: {
      phone: normalizedPhone,
      business_id: business.id,
      code: code.trim(),
      verified: false,
      used: false,
      expires_at: { gte: new Date() },
    },
    orderBy: { created_at: "desc" },
  });

  if (!otpRecord) {
    return {
      success: false,
      error: "Invalid or expired code. Please request a new one.",
    };
  }

  await prisma.bookingOtpCode.update({
    where: { id: otpRecord.id },
    data: { verified: true },
  });

  // Determine current trust tier for this customer
  const localPhone =
    normalizedPhone.startsWith("63") && normalizedPhone.length === 12
      ? "0" + normalizedPhone.slice(2)
      : normalizedPhone;

  const customer = await prisma.customer.findFirst({
    where: {
      business_id: business.id,
      phone: { in: [normalizedPhone, localPhone] },
    },
    select: { trust_tier: true, name: true, email: true },
  });

  return {
    success: true,
    verificationId: otpRecord.id,
    customerTier: (customer?.trust_tier as CustomerTrust) ?? "NEW",
    customerName: customer?.name ?? undefined,
    customerEmail: customer?.email ?? undefined,
  };
}

/**
 * Marks a previously verified OTP as fully used.
 * Must be called inside the booking creation transaction.
 * Returns false if the OTP is no longer valid (expired, already used, wrong business).
 */
export async function consumeOtpVerification(
  verificationId: number,
  phone: string,
  businessId: string,
): Promise<boolean> {
  const normalizedPhone = normalizePhilippinePhone(phone);
  const localPhone =
    normalizedPhone.startsWith("63") && normalizedPhone.length === 12
      ? "0" + normalizedPhone.slice(2)
      : normalizedPhone;

  const otpRecord = await prisma.bookingOtpCode.findFirst({
    where: {
      id: verificationId,
      business_id: businessId,
      phone: { in: [normalizedPhone, localPhone] },
      verified: true,
      used: false,
      expires_at: { gte: new Date() },
    },
  });

  if (!otpRecord) return false;

  await prisma.bookingOtpCode.update({
    where: { id: otpRecord.id },
    data: { used: true },
  });

  return true;
}
