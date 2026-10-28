import "server-only";

import { prisma } from "@/prisma/prisma";
import { createOtpVerificationProof, verifyOtpVerificationProof } from "@/features/bookings/services/otp-proof";
import {
  sendSemaphoreOtp,
  normalizePhilippinePhone,
} from "@/lib/services/sms-otp";
import { BookingStatus, type Prisma } from "@/prisma/generated/prisma/client";
import type { CustomerTrust, CustomerTrustResult, RequestOtpResult, VerifyOtpResult } from "@/features/bookings/otp-types";

const OTP_EXPIRY_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 60;


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
      const promoted = await prisma.customer.updateMany({
        where: { id: customer.id, business_id: business.id, trust_tier: "NEW" },
        data: { trust_tier: "TRUSTED" },
      });
      if (promoted.count === 1) {
        tier = "TRUSTED";
      } else {
        const current = await prisma.customer.findFirst({
          where: { id: customer.id, business_id: business.id },
          select: { trust_tier: true },
        });
        tier = (current?.trust_tier as CustomerTrust) ?? "NEW";
      }
    }
  }

  return {
    tier,
    requiresOtp: true,
  };
}


/**
 * Sends an OTP via Semaphore to the given phone number.
 * Transport rate limits are enforced by the public action.
 * Enforces a 60-second cooldown between consecutive sends.
 */
export async function requestBookingOtp(
  phone: string,
  businessSlug: string,
): Promise<RequestOtpResult> {
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
  } catch {
    console.error("[booking-otp] Failed to send or persist verification code.");
    return {
      success: false,
      error:
        "Failed to send the verification code. Please try again in a moment.",
    };
  }
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

  return prisma.$transaction(async (tx) => {
    const otpRecord = await tx.bookingOtpCode.findFirst({
      where: {
        phone: normalizedPhone,
        business_id: business.id,
        code: code.trim(),
        verified: false,
        used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: "desc" },
      select: { id: true },
    });

    if (!otpRecord) {
      return {
        success: false,
        error: "Invalid or expired code. Please request a new one.",
      };
    }

    const claimed = await tx.bookingOtpCode.updateMany({
      where: {
        id: otpRecord.id, phone: normalizedPhone, business_id: business.id,
        code: code.trim(), verified: false, used: false,
        expires_at: { gt: new Date() },
      },
      data: { verified: true },
    });
    if (claimed.count !== 1) {
      return { success: false, error: "Invalid or expired code. Please request a new one." };
    }

    // Determine current trust tier for this customer
    const localPhone =
      normalizedPhone.startsWith("63") && normalizedPhone.length === 12
        ? "0" + normalizedPhone.slice(2)
        : normalizedPhone;
    const shortPhone =
      normalizedPhone.startsWith("63") && normalizedPhone.length === 12
        ? normalizedPhone.slice(2)
        : normalizedPhone;

    const customer = await tx.customer.findFirst({
      where: {
        business_id: business.id,
        phone: { in: [normalizedPhone, localPhone, shortPhone] },
      },
      select: { trust_tier: true, name: true, email: true },
    });

    return {
      success: true,
      verificationId: otpRecord.id,
      verificationToken: createOtpVerificationProof(otpRecord.id, normalizedPhone, business.id),
      customerTier: (customer?.trust_tier as CustomerTrust) ?? "NEW",
      customerName: customer?.name ?? undefined,
      customerEmail: customer?.email ?? undefined,
    };
  });
}

// Internal capability. A booking transaction client is required; no global fallback.
export async function consumeOtpVerification(
  tx: Prisma.TransactionClient,
  verificationId: number,
  phone: string,
  businessId: string,
  verificationToken: string,
): Promise<boolean> {
  if (!verifyOtpVerificationProof(verificationToken, verificationId, phone, businessId)) return false;
  const normalizedPhone = normalizePhilippinePhone(phone);
  const result = await tx.bookingOtpCode.updateMany({
    where: {
      id: verificationId, business_id: businessId,
      phone: { in: [normalizedPhone, "0" + normalizedPhone.slice(2), normalizedPhone.slice(2)] },
      verified: true, used: false, expires_at: { gt: new Date() },
    },
    data: { used: true },
  });
  return result.count === 1;
}
