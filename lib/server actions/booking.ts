"use server";

import { createBookingInDb } from "@/lib/services/booking";

import { createPayMongoQrPaymentIntent } from "./paymongo";
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
import { createBookingSuccessToken } from "@/lib/security/booking-success-token";
import { rateLimit } from "@/lib/rate-limit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next auth/options";
import { getQrExpirySeconds } from "@/lib/payments/config";
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
    name: string;
    price: number;
    quantity: number;
    duration?: number;
    claimedByCurrentEmployee?: boolean;
    packageId?: number;
    originalPrice?: number;
  }[];
  voucherCode?: string;
  isWalkIn?: boolean;
  staffSelectionMode?: StaffSelectionMode;
  capacityOverride?: {
    reason: CapacityOverrideReason;
    note?: string;
  };
}

export type CreateBookingResult =
  | { type: "redirect"; url: string; warnings?: string[] }
  | {
      type: "qrph";
      paymentIntentId: string;
      paymentMethodId: string;
      bookingId: number;
      qrImage: string;
      successToken: string;
      expiresAt?: string;
      warnings?: string[];
    }
  | { type: "internal"; url: string; warnings?: string[] };

function getPublicAppUrl() {
  const configuredAppUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

  if (!configuredAppUrl) {
    return "http://localhost:3000";
  }

  try {
    const url = new URL(configuredAppUrl);
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid absolute URL");
  }
}

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
    const forwardedFor = headersList.get("x-forwarded-for") || "";
    const clientIp = forwardedFor.split(",")[0]?.trim() || "unknown";
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
    const amountToPay = pricing.amountToPay;
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

    if (paymentMethod === "CASH") {
      const booking = await createBookingInDb({
        businessSlug,
        customerId,
        customerName,
        services: processedServices, // Pass processed services
        scheduledAt,
        estimatedEnd,
        employeeId,
        currentEmployeeId,
        paymentMethod: "CASH",
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
        pricingSnapshot: pricing,
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
              completionPath: "CASH",
              assignmentDowngraded,
              capacityOverrideApplied: walkInCapacityBypassAllowed,
            },
          });
        }
      }

      if (!isWalkIn) {
        // Email is handled via Outbox (BOOKING_CONFIRMED event)
        // await sendBookingConfirmation(booking.id);
      }

      revalidatePath(`/app/${businessSlug}`);
      return {
        type: "internal",
        url: `/app/${businessSlug}/bookings/${booking.id}?created=true`,
        warnings: submitWarnings.length > 0 ? submitWarnings : undefined,
      };
    }

    if (!email) {
      throw new Error("Email is required for QR payments");
    }

    const metadata = {
      businessSlug,
      businessName: pricing.business.name,
      customerId,
      customerName,
      email,
      phone,
      scheduledAt: scheduledAt.toISOString(),
      estimatedEnd: estimatedEnd.toISOString(),
      employeeId: employeeId?.toString(),
      currentEmployeeId: currentEmployeeId?.toString(),
      paymentMethod,
      paymentType,
      voucherCode: pricing.voucher?.code,
      isWalkIn: isWalkIn ? "true" : "false",
      staffSelectionMode,
      capacityOverrideReason: capacityOverride?.reason,
      capacityOverrideNote: capacityOverride?.note,
      capacityOverrideApplied: walkInCapacityBypassAllowed ? "true" : "false",
      services: JSON.stringify(
        processedServices.map((s) => ({
          id: s.id,
          name: s.name,
          price: s.price,
          quantity: s.quantity,
          duration: s.duration || 30,
          claimedByCurrentEmployee: s.claimedByCurrentEmployee,
          packageId: s.packageId,
          originalPrice: s.originalPrice,
          discount: s.discount,
          discountReason: s.discountReason,
          commissionBase: s.commissionBase,
        })),
      ),
    };

    const publicAppUrl = getPublicAppUrl();
    const returnUrl = new URL(
      `/${businessSlug}/booking/success`,
      `${publicAppUrl}/`,
    ).toString();

    const paymongoDescription = `${pricing.business.name} (${pricing.business.slug}) - ${paymentType === "DOWNPAYMENT" ? "Downpayment for " : ""}Booking for ${customerName}`;

    const qrPayment = await createPayMongoQrPaymentIntent({
      amount: Math.round(amountToPay * 100),
      description: paymongoDescription,
      metadata,
      billing: {
        name: customerName,
        email,
        phone,
      },
      returnUrl,
      expirySeconds: getQrExpirySeconds(),
    });

    const booking = await createBookingInDb({
      businessSlug,
      customerId,
      customerName,
      services: processedServices,
      scheduledAt,
      estimatedEnd,
      employeeId,
      currentEmployeeId,
      paymentMethod: "QRPH",
      paymentType,
      email,
      phone,
      voucherCode: pricing.voucher?.code,
      totalDiscount: pricing.voucherDiscount,
      paymongoPaymentIntentId: qrPayment.paymentIntentId,
      paymongoPaymentMethodId: qrPayment.paymentMethodId,
      isPublicBooking: !session,
      isWalkIn,
      staffSelectionMode,
      capacityOverride,
      allowWalkInCapacityBypass: walkInCapacityBypassAllowed,
      pricingSnapshot: pricing,
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
          completionPath: "QRPH_HOLD",
          assignmentDowngraded,
          capacityOverrideApplied: walkInCapacityBypassAllowed,
        },
      });
    }

    revalidatePath(`/app/${businessSlug}`);

    return {
      type: "qrph",
      paymentIntentId: qrPayment.paymentIntentId,
      paymentMethodId: qrPayment.paymentMethodId,
      bookingId: booking.id,
      qrImage: qrPayment.qrImage,
      successToken: createBookingSuccessToken({
        bookingId: booking.id,
        businessSlug,
      }),
      expiresAt: qrPayment.expiresAt,
      warnings: submitWarnings.length > 0 ? submitWarnings : undefined,
    };
  } catch (err) {
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
