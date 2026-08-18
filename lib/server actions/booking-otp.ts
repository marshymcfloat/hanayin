"use server";

import { prisma } from "@/prisma/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFromForwardedFor } from "@/lib/client-ip";
import { headers } from "next/headers";
import {
  sendSemaphoreOtp,
  normalizePhilippinePhone,
} from "@/lib/services/sms-otp";
import { BookingStatus } from "@/prisma/generated/prisma/client";

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
 * - TRUSTED  → customer has prior successful history, but must still verify OTP
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
  // Build all formats the phone may have been stored as
  const localPhone =
    normalizedPhone.startsWith("63") && normalizedPhone.length === 12
      ? "0" + normalizedPhone.slice(2)
      : normalizedPhone;
  // Short 10-digit format (9XXXXXXXXX) — stored when user types in the +63 prefixed input
  const shortPhone =
    normalizedPhone.startsWith("63") && normalizedPhone.length === 12
      ? normalizedPhone.slice(2)
      : normalizedPhone;

  const customer = await prisma.customer.findFirst({
    where: {
      business_id: business.id,
      phone: { in: [normalizedPhone, localPhone, shortPhone] },
    },
    // Do not return identity data from a phone-number existence check.
    // Name and email are fetched only after a successful OTP verification.
    select: { id: true, trust_tier: true },
  });

  if (!customer) return { tier: "NEW", requiresOtp: true };

  let tier = (customer.trust_tier as CustomerTrust) ?? "NEW";

  // Backfill booking-history trust independently from phone ownership.
  if (tier === "NEW") {
    const completedBooking = await prisma.booking.findFirst({
      where: {
        customer_id: customer.id,
        business_id: business.id,
        status: BookingStatus.COMPLETED,
      },
      select: { id: true },
    });
    if (completedBooking) {
      await prisma.customer.updateMany({
        where: { id: customer.id, trust_tier: "NEW" },
        data: { trust_tier: "TRUSTED" },
      });
      tier = "TRUSTED";
    }
  }

  return {
    tier,
    requiresOtp: true,
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
  const clientIp = clientIpFromForwardedFor(headersList.get("x-forwarded-for"));
  const normalizedPhoneForKey = normalizePhilippinePhone(phone);

  // Two buckets layered so neither vector wins:
  //   1. Per-phone bucket protects a single victim from OTP spam regardless
  //      of how many IPs the attacker rotates through. Previously the IP
  //      was part of the key, which let an IPv6 /64 rotation reset the
  //      counter — that's the hole this closes.
  //   2. Per-IP bucket caps a single (normalized) source from blasting
  //      OTPs across many different phones.
  // If either trips, deny. The DB-level per-number cooldown below adds a
  // third layer of defense.
  const phoneLimiter = await rateLimit(
    `otp-request:phone:${normalizedPhoneForKey}:${businessSlug}`,
    { windowMs: 5 * 60 * 1000, maxRequests: 3 },
  );
  if (!phoneLimiter.success) {
    return {
      success: false,
      error: "Too many verification attempts. Please wait a few minutes.",
      cooldownSeconds: 300,
    };
  }

  const ipLimiter = await rateLimit(
    `otp-request:ip:${businessSlug}:${clientIp}`,
    { windowMs: 5 * 60 * 1000, maxRequests: 10 },
  );
  if (!ipLimiter.success) {
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
  const shortPhone =
    normalizedPhone.startsWith("63") && normalizedPhone.length === 12
      ? normalizedPhone.slice(2)
      : normalizedPhone;

  const customer = await prisma.customer.findFirst({
    where: {
      business_id: business.id,
      phone: { in: [normalizedPhone, localPhone, shortPhone] },
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
  const shortPhone =
    normalizedPhone.startsWith("63") && normalizedPhone.length === 12
      ? normalizedPhone.slice(2)
      : normalizedPhone;

  const otpRecord = await prisma.bookingOtpCode.findFirst({
    where: {
      id: verificationId,
      business_id: businessId,
      phone: { in: [normalizedPhone, localPhone, shortPhone] },
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
