import { prisma } from "@/prisma/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { logger } from "@/lib/logger";
import {
  classifySelfServeWindow,
  isSelfServeAllowed,
} from "@/lib/services/booking-self-serve-policy";
import { publishEvent } from "@/lib/services/outbox";
import {
  validateBookingOrThrow,
  BookingAvailabilityError,
} from "@/features/bookings/services/booking-availability";

import type { BookingForManage } from "@/features/bookings/self-serve-types";

export type VerifiedBookingManageContext = {
  bookingId: number;
  businessSlug: string;
};

/** Loads customer-facing fields using the token-verified booking and tenant context. */
export async function getBookingForManage(
  input: VerifiedBookingManageContext,
): Promise<
  | { success: true; booking: BookingForManage }
  | { success: false; error: string }
> {
  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, business: { slug: input.businessSlug } },
    select: {
      id: true,
      status: true,
      scheduled_at: true,
      estimated_end: true,
      grand_total: true,
      amount_paid: true,
      payment_status: true,
      cancelled_at: true,
      reschedule_count: true,
      customer_label: true,
      customer: { select: { name: true } },
      business: { select: { name: true, slug: true } },
      availed_services: {
        where: { status: { not: "CANCELLED" } },
        select: { service_id: true, service: { select: { name: true } } },
      },
    },
  });

  if (!booking) {
    return { success: false, error: "Booking not found." };
  }

  return {
    success: true,
    booking: {
      bookingId: booking.id,
      businessSlug: booking.business.slug,
      businessName: booking.business.name,
      scheduledAt: booking.scheduled_at?.toISOString() ?? "",
      estimatedEnd: booking.estimated_end?.toISOString() ?? null,
      totalPrice: booking.grand_total,
      paymentStatus: booking.payment_status,
      amountPaid: booking.amount_paid ?? 0,
      serviceNames: booking.availed_services
        .map((a) => a.service?.name)
        .filter((n): n is string => !!n),
      serviceIds: booking.availed_services.map((a) => a.service_id),
      customerName: booking.customer?.name ?? booking.customer_label ?? null,
      status: booking.status,
      cancelled: booking.status === "CANCELLED" || !!booking.cancelled_at,
      rescheduleCount: booking.reschedule_count,
      window: classifySelfServeWindow(booking.scheduled_at),
    },
  };
}

/**
 * Customer cancellation using the adapter's token-verified context. Checks the window,
 * marks the booking CANCELLED, sets the cancelled_by_customer flag, and
 * publishes a BOOKING_CANCELLED_BY_CUSTOMER outbox event so any future
 * notifications surface picks it up.
 */
export async function cancelBookingByCustomer({
  bookingId,
  businessSlug,
  reason,
}: VerifiedBookingManageContext & { reason?: string }) {
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findFirst({
        where: { id: bookingId, business: { slug: businessSlug } },
        select: {
          id: true,
          status: true,
          scheduled_at: true,
          business_id: true,
          cancelled_at: true,
        },
      });
      if (!existing) {
        throw new Error("BOOKING_NOT_FOUND");
      }
      if (existing.status === "CANCELLED" || existing.cancelled_at) {
        throw new Error("ALREADY_CANCELLED");
      }
      if (!isSelfServeAllowed(existing.scheduled_at)) {
        throw new Error("WINDOW_CLOSED");
      }

      const now = new Date();
      await tx.booking.update({
        where: { id: existing.id },
        data: {
          status: "CANCELLED",
          cancelled_at: now,
          cancelled_by_customer: true,
          cancellation_reason: reason?.slice(0, 200) ?? "Cancelled by customer",
        },
      });

      // Cascade-cancel non-completed availed services so capacity frees
      // up immediately. Completed services keep their COMPLETED status.
      await tx.availedService.updateMany({
        where: {
          booking_id: existing.id,
          status: { in: ["PENDING", "CLAIMED", "SERVING"] },
        },
        data: { status: "CANCELLED", cancelled_at: now },
      });

      // Restore any voucher that was consumed by this booking so the
      // customer doesn't lose its value when they self-serve cancel.
      // Mirrors the expire-holds cron behavior. Gift cards are not
      // restored here — there's no direct Booking → GiftCard FK, and
      // gift cards aren't restored anywhere else in the codebase
      // (including expire-holds), so changing that here would diverge
      // from system-wide semantics. If gift-card restoration becomes a
      // requirement, it needs a coordinated change at all three sites.
      await tx.voucher.updateMany({
        where: { used_by_id: existing.id },
        data: { used_by_id: null, is_active: true },
      });

      await publishEvent(tx, {
        type: "BOOKING_CANCELLED_BY_CUSTOMER",
        aggregateType: "Booking",
        aggregateId: String(existing.id),
        businessId: existing.business_id,
        payload: {
          bookingId: existing.id,
          scheduledAt: existing.scheduled_at?.toISOString() ?? null,
          reason: reason ?? null,
        },
      });

      return existing.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { success: true as const };
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    if (code === "WINDOW_CLOSED") {
      return {
        success: false as const,
        error: "This booking is too close to its appointment time to cancel online. Please call the business.",
      };
    }
    if (code === "ALREADY_CANCELLED") {
      return { success: false as const, error: "This booking is already cancelled." };
    }
    if (code === "BOOKING_NOT_FOUND") {
      return { success: false as const, error: "Booking not found." };
    }
    logger.warn("[BookingSelfServe] Cancel failed", {
      bookingId,
      businessSlug,
      reason: code,
    });
    return { success: false as const, error: "Could not cancel the booking." };
  }
}

/**
 * Customer self-serve reschedule. Same booking ID, new scheduled_at.
 * Validates the new slot using the regular availability machinery so
 * a customer can't reschedule into a closed/full slot. Clears the
 * served_by assignment so capacity recomputes from scratch — staff
 * can reassign or accept any-available.
 */
export async function rescheduleBookingByCustomer({
  bookingId,
  businessSlug,
  newScheduledAt,
}: VerifiedBookingManageContext & { newScheduledAt: Date }) {
  try {
    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.booking.findFirst({
          where: { id: bookingId, business: { slug: businessSlug } },
          select: {
            id: true,
            status: true,
            scheduled_at: true,
            estimated_end: true,
            business_id: true,
            cancelled_at: true,
            reschedule_count: true,
            availed_services: {
              where: { status: { not: "CANCELLED" } },
              select: { id: true, service_id: true, service: { select: { duration: true } } },
            },
          },
        });
        if (!existing) throw new Error("BOOKING_NOT_FOUND");
        if (existing.status === "CANCELLED" || existing.cancelled_at) {
          throw new Error("ALREADY_CANCELLED");
        }
        if (existing.status !== "ACCEPTED") {
          throw new Error("BOOKING_NOT_CONFIRMED");
        }
        if (!isSelfServeAllowed(existing.scheduled_at)) {
          throw new Error("WINDOW_CLOSED");
        }

        // Validate the new slot using the same machinery the public
        // booking flow uses — ensures we never reschedule into a slot
        // that's actually full.
        const services = existing.availed_services.map((a) => ({
          id: a.service_id,
          quantity: 1,
        }));
        await validateBookingOrThrow({
          businessSlug,
          scheduledAt: newScheduledAt,
          services,
          paymentType: "FULL",
          isPublicBooking: true,
          db: tx,
        });

        // Compute new estimatedEnd from total service duration.
        const totalDuration = existing.availed_services.reduce(
          (sum, a) => sum + (a.service?.duration ?? 30),
          0,
        );
        const newEstimatedEnd = new Date(
          newScheduledAt.getTime() + totalDuration * 60 * 1000,
        );

        // Clear staff assignment so the floor manager (or auto-claim)
        // picks who serves the new slot. Keeps it simple — no attempt
        // at preserving the original employee since they may not be
        // working the new slot.
        await tx.availedService.updateMany({
          where: {
            booking_id: existing.id,
            status: { in: ["PENDING", "CLAIMED"] },
          },
          data: {
            scheduled_at: newScheduledAt,
            estimated_end: newEstimatedEnd,
            served_by_id: null,
            claimed_at: null,
            status: "PENDING",
          },
        });

        await tx.booking.update({
          where: { id: existing.id },
          data: {
            scheduled_at: newScheduledAt,
            estimated_end: newEstimatedEnd,
            rescheduled_at: new Date(),
            reschedule_count: { increment: 1 },
          },
        });

        await publishEvent(tx, {
          type: "BOOKING_RESCHEDULED_BY_CUSTOMER",
          aggregateType: "Booking",
          aggregateId: String(existing.id),
          businessId: existing.business_id,
          payload: {
            bookingId: existing.id,
            previousScheduledAt:
              existing.scheduled_at?.toISOString() ?? null,
            newScheduledAt: newScheduledAt.toISOString(),
          },
        });

        return existing.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { success: true as const };
  } catch (error) {
    if (error instanceof BookingAvailabilityError) {
      // Re-surface availability codes so the UI can show a useful
      // message ("slot just taken", "no capacity", etc.).
      return { success: false as const, error: error.message };
    }
    const code = error instanceof Error ? error.message : String(error);
    if (code === "WINDOW_CLOSED") {
      return {
        success: false as const,
        error: "This booking is too close to its appointment time to reschedule online. Please call the business.",
      };
    }
    if (code === "ALREADY_CANCELLED") {
      return { success: false as const, error: "This booking has been cancelled and cannot be rescheduled." };
    }
    if (code === "BOOKING_NOT_FOUND") {
      return { success: false as const, error: "Booking not found." };
    }
    logger.warn("[BookingSelfServe] Reschedule failed", {
      bookingId,
      businessSlug,
      reason: code,
    });
    return { success: false as const, error: "Could not reschedule the booking." };
  }
}
