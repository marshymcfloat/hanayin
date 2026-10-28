import { getTenantAccessState, SUBSCRIPTION_READ_ONLY_ERROR } from "@/features/billing/subscription-service";
import type {
  PaymentMethod,
  PaymentType,
  StaffSelectionMode,
} from "@/features/bookings/schemas";
import { buildBookingPricingSnapshot } from "@/features/bookings/services/booking-pricing";
import {
  BookingAvailabilityError,
  resolveStaffSelectionOrThrow,
  validateBookingOrThrow,
} from "@/features/bookings/services/booking-availability";
import { recordBookingMetric } from "@/features/bookings/services/booking-metrics";
import { createBookingInDb } from "@/features/bookings/services/booking-persistence";
import { prisma } from "@/prisma/prisma";

export type BookingCreationServiceInput = {
  expectedQuoteFingerprint?: string;
  requestKey?: string;
  customerId?: string;
  customerName: string;
  businessSlug: string;
  scheduledAt: Date;
  employeeId?: number;
  currentEmployeeId?: number;
  paymentMethod: PaymentMethod;
  paymentType: PaymentType;
  email?: string;
  phone?: string;
  otpVerificationId?: number;
  otpVerificationToken?: string;
  services: {
    id: number;
    quantity: number;
    claimedByCurrentEmployee?: boolean;
    packageId?: number;
    packageInstanceId?: string; packageChoiceId?: string; selectionKey?: string;
  }[];
  voucherCode?: string;
  isWalkIn: boolean;
  staffSelectionMode: StaffSelectionMode;
  isAnonymousWalkIn: boolean;
  forceCreateCustomer: boolean;
};

export type BookingCreationContext = {
  requestScope?: string;
  businessId: string;
  isPublicBooking: boolean;
  allowWalkInCapacityBypass: boolean;
};

export type BookingCreationOutcome = {
  bookingId: number;
  warnings: string[];
};

export async function requireWritableBookingTenant(businessSlug: string) {
  const accessState = await getTenantAccessState(businessSlug);
  if (!accessState.exists) {
    throw new Error("Business not found");
  }
  if (accessState.readOnly) {
    throw new Error(SUBSCRIPTION_READ_ONLY_ERROR);
  }
  return { businessId: accessState.businessId };
}

export async function createBookingWorkflow(
  input: BookingCreationServiceInput,
  context: BookingCreationContext,
): Promise<BookingCreationOutcome> {
  let assignmentDowngraded = false;
  if (input.requestKey && context.requestScope && await prisma.booking.findFirst({ where: { business_id: context.businessId, request_scope: context.requestScope, request_key: input.requestKey }, select: { id: true } })) {
    const existing = await createBookingInDb({ ...input, estimatedEnd: input.scheduledAt, requestScope: context.requestScope, isPublicBooking: context.isPublicBooking, isAnonymousWalkIn: !context.isPublicBooking && input.isAnonymousWalkIn, forceCreateCustomer: !context.isPublicBooking && input.forceCreateCustomer, allowWalkInCapacityBypass: context.allowWalkInCapacityBypass });
    return { bookingId: existing.id, warnings: [] };
  }

  try {
    if (context.isPublicBooking) {
      await recordBookingMetric({
        businessId: context.businessId,
        action: "PUBLIC_BOOKING_STARTED",
        outcome: "STARTED",
        metadata: {
          paymentMethod: input.paymentMethod,
          paymentType: input.paymentType,
          isWalkIn: input.isWalkIn,
          staffSelectionMode: input.staffSelectionMode,
          capacityOverrideApplied: context.allowWalkInCapacityBypass,
        },
      });
    }

    await recordBookingMetric({
      businessId: context.businessId,
      action: "BOOKING_SUBMIT_ATTEMPT",
      outcome: "STARTED",
      metadata: {
        isPublicBooking: context.isPublicBooking,
        paymentMethod: input.paymentMethod,
        paymentType: input.paymentType,
        isWalkIn: input.isWalkIn,
        staffSelectionMode: input.staffSelectionMode,
        capacityOverrideApplied: context.allowWalkInCapacityBypass,
      },
    });

    const pricing = await buildBookingPricingSnapshot({
      db: prisma,
      businessSlug: input.businessSlug,
      scheduledAt: input.scheduledAt,
      services: input.services,
      paymentMethod: input.paymentMethod,
      paymentType: input.paymentType,
      voucherCode: input.voucherCode,
    });
    const processedServices = pricing.services;

    const staffResolution = await resolveStaffSelectionOrThrow({
      businessSlug: input.businessSlug,
      scheduledAt: input.scheduledAt,
      services: processedServices.map((service) => ({
        id: service.id,
        quantity: service.quantity,
      })),
      selectedEmployeeId: input.employeeId,
      staffSelectionMode: input.staffSelectionMode,
      db: prisma,
    });
    assignmentDowngraded = staffResolution.assignmentDowngraded;

    await validateBookingOrThrow({
      businessSlug: input.businessSlug,
      scheduledAt: input.scheduledAt,
      services: processedServices.map((service) => ({
        id: service.id,
        quantity: service.quantity,
      })),
      paymentType: input.paymentType,
      isPublicBooking: context.isPublicBooking,
      isWalkIn: input.isWalkIn,
      selectedEmployeeId: input.employeeId,
      staffSelectionMode: input.staffSelectionMode,
      allowWalkInCapacityBypass: context.allowWalkInCapacityBypass,
      db: prisma,
    });

    const booking = await createBookingInDb({
      businessSlug: input.businessSlug,
      customerId: input.customerId,
      customerName: input.customerName,
      services: input.services,
      scheduledAt: input.scheduledAt,
      estimatedEnd: pricing.estimatedEnd,
      employeeId: input.employeeId,
      currentEmployeeId: input.currentEmployeeId,
      paymentMethod: input.paymentMethod,
      paymentType: input.paymentType,
      email: input.email,
      phone: input.phone,
      otpVerificationId: input.otpVerificationId,
      otpVerificationToken: input.otpVerificationToken,
      voucherCode: input.voucherCode,
      expectedQuoteFingerprint: input.expectedQuoteFingerprint,
      requestKey: input.requestKey,
      requestScope: context.requestScope,
      totalDiscount: pricing.voucherDiscount,
      isPublicBooking: context.isPublicBooking,
      isWalkIn: input.isWalkIn,
      isAnonymousWalkIn:
        !context.isPublicBooking && input.isAnonymousWalkIn,
      forceCreateCustomer:
        !context.isPublicBooking && input.forceCreateCustomer,
      staffSelectionMode: input.staffSelectionMode,
      allowWalkInCapacityBypass: context.allowWalkInCapacityBypass,
    });

    await recordBookingMetric({
      businessId: context.businessId,
      action: "BOOKING_SUBMIT_SUCCESS",
      outcome: "SUCCESS",
      metadata: {
        isPublicBooking: context.isPublicBooking,
        paymentMethod: input.paymentMethod,
        paymentType: input.paymentType,
        bookingId: booking.id,
        assignmentDowngraded,
        capacityOverrideApplied: context.allowWalkInCapacityBypass,
      },
    });
    if (context.isPublicBooking) {
      await recordBookingMetric({
        businessId: context.businessId,
        action: "PUBLIC_BOOKING_COMPLETED",
        outcome: "COMPLETED",
        metadata: {
          bookingId: booking.id,
          assignmentDowngraded,
          capacityOverrideApplied: context.allowWalkInCapacityBypass,
        },
      });
    }

    return {
      bookingId: booking.id,
      warnings: staffResolution.warning ? [staffResolution.warning] : [],
    };
  } catch (error) {
    if (error instanceof BookingAvailabilityError) {
      await recordBookingMetric({
        businessId: context.businessId,
        action: "BOOKING_SUBMIT_REJECTION",
        outcome: "REJECTED",
        reason: error.code,
        metadata: {
          isPublicBooking: context.isPublicBooking,
          walkInRejectedNoCapacity:
            error.code === "WALK_IN_CAPACITY_EXCEEDED",
          capacityOverrideApplied: context.allowWalkInCapacityBypass,
        },
      });
    }
    throw error;
  }
}
