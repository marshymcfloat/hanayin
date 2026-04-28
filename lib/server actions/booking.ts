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
    const realIp = headersList.get("x-real-ip")?.trim();
    const forwardedFor = headersList.get("x-forwarded-for") || "";
    const clientIp = realIp || forwardedFor.split(",")[0]?.trim() || "unknown";
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
      const limiter = await rateLimit(
        `public-booking:${businessSlug}:${clientIp}`,
        {
        windowMs: 10 * 60 * 1000,
        maxRequests: 8,
      },
      );

      if (!limiter.success) {
        throw new Error(
          "Too many booking attempts. Please wait a few minutes and try again.",
        );
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
    return {
      type: "internal",
      url: `/app/${businessSlug}/bookings/${booking.id}?created=true`,
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
