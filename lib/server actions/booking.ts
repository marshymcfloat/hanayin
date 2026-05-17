"use server";

import { createBookingInDb } from "@/lib/services/booking";

import { prisma } from "@/prisma/prisma";
import {
  PaymentMethod,
  PaymentType,
  StaffSelectionMode,
  CapacityOverrideReason,
} from "@/lib/zod schemas/bookings";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { buildBookingPricingSnapshot } from "@/lib/services/booking-pricing";
import { rateLimit } from "@/lib/rate-limit";
import {
  clientIpFromForwardedFor,
  normalizeClientIp,
} from "@/lib/client-ip";
import {
  BOOKING_SUCCESS_TOKEN_TTL_SECONDS,
  createBookingSuccessToken,
} from "@/lib/security/booking-success-token";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next auth/options";
import { getTenantAccessState, SUBSCRIPTION_READ_ONLY_ERROR } from "@/features/billing/subscription-service";
import {
  BookingAvailabilityError,
  resolveStaffSelectionOrThrow,
  validateBookingOrThrow,
} from "@/lib/services/booking-availability";
import { recordBookingMetric } from "@/lib/services/booking-metrics";
import { logger } from "@/lib/logger";
import {
  hasStaffPermission,
  resolveTenantActorContext,
} from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import {
  consumeOtpVerification,
  resolveCustomerTrust,
} from "@/lib/server actions/booking-otp";

interface CreateBookingParams {
  customerId?: string;
  customerName: string;
  businessSlug: string;
  scheduledAt: Date;
  employeeId?: number;
  paymentMethod: PaymentMethod;
  paymentType: PaymentType;
  email?: string;
  phone?: string;
  services: {
    id: number;
    quantity: number;
    claimedByCurrentEmployee?: boolean;
    packageId?: number;
  }[];
  voucherCode?: string;
  isWalkIn?: boolean;
  staffSelectionMode?: StaffSelectionMode;
  capacityOverride?: {
    reason: CapacityOverrideReason;
    note?: string;
  };
  /** OTP verification ID from verifyBookingOtp — required for public bookings by NEW customers. */
  otpVerificationId?: number;
  /**
   * Staff-only: skip Customer creation entirely. customer_id will be null on
   * the resulting Booking and the customerName is stored as customer_label.
   */
  isAnonymousWalkIn?: boolean;
  /**
   * Staff-only: when staff confirms "create new anyway" in the duplicate
   * dialog, skip the silent-link path in the customer-resolution block and
   * always create a fresh Customer record.
   */
  forceCreateCustomer?: boolean;
}

export type CreateBookingResult =
  | { type: "redirect"; url: string; warnings?: string[] }
  | { type: "internal"; url: string; warnings?: string[] };


export async function createBooking({
  customerId,
  customerName,
  businessSlug,
  scheduledAt,
  employeeId,
  currentEmployeeId,
  paymentMethod,
  paymentType,
  services,
  email,
  phone,
  voucherCode,
  isWalkIn = false,
  staffSelectionMode = "ANY_AVAILABLE",
  capacityOverride,
  otpVerificationId,
  isAnonymousWalkIn = false,
  forceCreateCustomer = false,
}: CreateBookingParams & {
  currentEmployeeId?: number;
}): Promise<CreateBookingResult> {
  let metricBusinessId: string | null = null;
  let metricIsPublicBooking = false;
  let walkInCapacityBypassAllowed = false;
  let assignmentDowngraded = false;
  const submitWarnings: string[] = [];
  try {
    const headersList = await headers();
    // Prefer x-real-ip when set (Vercel / nginx style), else fall back
    // to the first hop of x-forwarded-for. Both routes through the
    // shared normalizer so IPv6 customers can't /64-rotate past the limit.
    const realIp = headersList.get("x-real-ip")?.trim();
    const clientIp = realIp
      ? normalizeClientIp(realIp)
      : clientIpFromForwardedFor(headersList.get("x-forwarded-for"));
    const session = await getServerSession(authOptions);

    if (
      session?.user?.businessSlug &&
      session.user.role !== "PLATFORM_ADMIN" &&
      session.user.businessSlug !== businessSlug
    ) {
      throw new Error("Forbidden");
    }

    let employeeActorContext:
      | Awaited<ReturnType<typeof resolveTenantActorContext>>
      | null = null;

    if (session?.user?.role === "EMPLOYEE") {
      const actorContext = await resolveTenantActorContext(
        businessSlug,
        session.user.id,
      );
      employeeActorContext = actorContext;
      if (!actorContext.success || actorContext.actorType !== "EMPLOYEE") {
        throw new Error("Unauthorized");
      }

      if (!hasStaffPermission(actorContext, StaffPermission.BOOKING_CREATE)) {
        throw new Error("Forbidden");
      }
    }

    if (isWalkIn && capacityOverride) {
      const hasEmployeeOverridePermission =
        session?.user.role === "EMPLOYEE" &&
        !!employeeActorContext &&
        employeeActorContext.success &&
        employeeActorContext.actorType === "EMPLOYEE" &&
        hasStaffPermission(employeeActorContext, StaffPermission.QUEUE_OVERRIDE_ALL);
      const hasOverridePermission =
        !!session &&
        (session.user.role === "OWNER" || hasEmployeeOverridePermission);

      if (!hasOverridePermission) {
        throw new BookingAvailabilityError(
          "CAPACITY_OVERRIDE_NOT_ALLOWED",
          "You do not have permission to override capacity for walk-ins.",
        );
      }

      walkInCapacityBypassAllowed = true;
    }

    if (!session) {
      // Per-IP bucket caps a single source. clientIp is /64-normalized
      // for IPv6 above so an attacker can't bypass by rotating addresses
      // within their ISP-assigned block.
      const ipLimiter = await rateLimit(
        `public-booking:${businessSlug}:${clientIp}`,
        { windowMs: 10 * 60 * 1000, maxRequests: 8 },
      );
      if (!ipLimiter.success) {
        throw new Error(
          "Too many booking attempts. Please wait a few minutes and try again.",
        );
      }

      // Per-phone bucket caps a single victim phone from being used
      // across many IPs (e.g. an attacker rotating through residential
      // proxies to spam-book under one number). Skipped when no phone
      // was supplied — anonymous flows are gated by the OTP path
      // upstream, which has its own per-phone limiter.
      if (phone) {
        const phoneLimiter = await rateLimit(
          `public-booking:phone:${businessSlug}:${phone.trim()}`,
          { windowMs: 10 * 60 * 1000, maxRequests: 5 },
        );
        if (!phoneLimiter.success) {
          throw new Error(
            "Too many booking attempts. Please wait a few minutes and try again.",
          );
        }
      }
    }

    const accessState = await getTenantAccessState(businessSlug);
    if (!accessState.exists) {
      throw new Error("Business not found");
    }
    if (accessState.readOnly) {
      throw new Error(SUBSCRIPTION_READ_ONLY_ERROR);
    }
    metricBusinessId = accessState.businessId;
    metricIsPublicBooking = !session;

    // --- OTP / trust-tier gate for public bookings ---
    if (!session && phone) {
      const trust = await resolveCustomerTrust(phone, businessSlug);

      if (trust.tier === "RESTRICTED") {
        throw new Error("CUSTOMER_RESTRICTED");
      }

      if (trust.tier === "NEW") {
        if (!otpVerificationId) {
          throw new Error("OTP_REQUIRED");
        }
        // Consume the OTP inside the same DB operation — consumeOtpVerification
        // is called here (non-transactional); the OTP validity window is 10 min
        // which is already enforced by the expires_at check inside the function.
        const valid = await consumeOtpVerification(
          otpVerificationId,
          phone,
          accessState.businessId!,
        );
        if (!valid) {
          throw new Error("OTP_INVALID_OR_EXPIRED");
        }
      }
    }

    if (metricBusinessId) {
      if (metricIsPublicBooking) {
        await recordBookingMetric({
          businessId: metricBusinessId,
          action: "PUBLIC_BOOKING_STARTED",
          outcome: "STARTED",
          metadata: {
            paymentMethod,
            paymentType,
            isWalkIn,
            staffSelectionMode,
            capacityOverrideApplied: walkInCapacityBypassAllowed,
          },
        });
      }

      await recordBookingMetric({
        businessId: metricBusinessId,
        action: "BOOKING_SUBMIT_ATTEMPT",
        outcome: "STARTED",
        metadata: {
          isPublicBooking: metricIsPublicBooking,
          paymentMethod,
          paymentType,
          isWalkIn,
          staffSelectionMode,
          capacityOverrideApplied: walkInCapacityBypassAllowed,
        },
      });
    }

    const pricing = await buildBookingPricingSnapshot({
      db: prisma,
      businessSlug,
      scheduledAt,
      services,
      paymentMethod,
      paymentType,
      voucherCode,
    });
    const processedServices = pricing.services;
    const estimatedEnd = pricing.estimatedEnd;

    const staffResolution = await resolveStaffSelectionOrThrow({
      businessSlug,
      scheduledAt,
      services: processedServices.map((service) => ({
        id: service.id,
        quantity: service.quantity,
      })),
      selectedEmployeeId: employeeId,
      staffSelectionMode,
      db: prisma,
    });
    assignmentDowngraded = staffResolution.assignmentDowngraded;
    if (staffResolution.warning) {
      submitWarnings.push(staffResolution.warning);
    }

    await validateBookingOrThrow({
      businessSlug,
      scheduledAt,
      services: processedServices.map((service) => ({
        id: service.id,
        quantity: service.quantity,
      })),
      paymentType,
      isPublicBooking: !session,
      isWalkIn,
      selectedEmployeeId: employeeId,
      staffSelectionMode,
      allowWalkInCapacityBypass: walkInCapacityBypassAllowed,
      capacityOverride,
      db: prisma,
    });

    const booking = await createBookingInDb({
      businessSlug,
      customerId,
      customerName,
      services,
      scheduledAt,
      estimatedEnd,
      employeeId,
      currentEmployeeId,
      paymentMethod,
      paymentType,
      email,
      phone,
      voucherCode: pricing.voucher?.code,
      totalDiscount: pricing.voucherDiscount,
      isPublicBooking: !session,
      isWalkIn,
      // Anonymous walk-ins are staff-only — `!session` blocks public callers
      // from setting it. forceCreateCustomer is also staff-only.
      isAnonymousWalkIn: !!session && isAnonymousWalkIn,
      forceCreateCustomer: !!session && forceCreateCustomer,
      staffSelectionMode,
      capacityOverride,
      allowWalkInCapacityBypass: walkInCapacityBypassAllowed,
    });

    if (metricBusinessId) {
      await recordBookingMetric({
        businessId: metricBusinessId,
        action: "BOOKING_SUBMIT_SUCCESS",
        outcome: "SUCCESS",
        metadata: {
          isPublicBooking: metricIsPublicBooking,
          paymentMethod,
          paymentType,
          bookingId: booking.id,
          assignmentDowngraded,
          capacityOverrideApplied: walkInCapacityBypassAllowed,
        },
      });
      if (metricIsPublicBooking) {
        await recordBookingMetric({
          businessId: metricBusinessId,
          action: "PUBLIC_BOOKING_COMPLETED",
          outcome: "COMPLETED",
          metadata: {
            bookingId: booking.id,
            assignmentDowngraded,
            capacityOverrideApplied: walkInCapacityBypassAllowed,
          },
        });
      }
    }

    revalidatePath(`/app/${businessSlug}`);
    // Public customers don't have access to the staff dashboard URL —
    // they need to land on the public success page (which carries the
    // "Manage your booking" link). Staff submissions (BookingDialog
    // inside the dashboard) go to the dashboard's booking detail page
    // as before.
    const successUrl = metricIsPublicBooking
      ? `/${businessSlug}/booking/success?bookingId=${booking.id}&token=${encodeURIComponent(
          createBookingSuccessToken({
            bookingId: booking.id,
            businessSlug,
            purpose: "success",
            ttlSeconds: BOOKING_SUCCESS_TOKEN_TTL_SECONDS,
          }),
        )}`
      : `/app/${businessSlug}/bookings/${booking.id}?created=true`;
    return {
      type: "internal",
      url: successUrl,
      warnings: submitWarnings.length > 0 ? submitWarnings : undefined,
    };
  } catch (err) {
    // Surface OTP/trust errors directly to the client
    if (err instanceof Error) {
      const otpErrors = new Set([
        "OTP_REQUIRED",
        "OTP_INVALID_OR_EXPIRED",
        "CUSTOMER_RESTRICTED",
      ]);
      if (otpErrors.has(err.message)) throw err;
    }

    if (err instanceof BookingAvailabilityError) {
      if (metricBusinessId) {
        await recordBookingMetric({
          businessId: metricBusinessId,
          action: "BOOKING_SUBMIT_REJECTION",
          outcome: "REJECTED",
          reason: err.code,
          metadata: {
            isPublicBooking: metricIsPublicBooking,
            walkInRejectedNoCapacity:
              err.code === "WALK_IN_CAPACITY_EXCEEDED",
            capacityOverrideApplied: walkInCapacityBypassAllowed,
          },
        });
      }
      logger.warn("[BookingSubmit] Rejected", {
        businessSlug,
        code: err.code,
        isPublicBooking: metricIsPublicBooking,
      });
      throw new Error(err.code);
    }
    logger.error("[BookingSubmit] Failed", {
      businessSlug,
      isPublicBooking: metricIsPublicBooking,
      error: err instanceof Error ? err.message : String(err),
    });
    console.error("Error creating booking:", err);
    throw err;
  }
}
