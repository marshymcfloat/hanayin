"use server";

/**
 * Server actions for in-place booking modifications (Phase 2 of the
 * booking-editor work).
 *
 * Today: removeBookingServiceAction. The companion swap and reschedule
 * actions live in their own follow-up PRs because they need a small
 * refactor of the existing add-on helpers to share a transaction with
 * the delete; that refactor is intentionally out of scope here.
 *
 * Permission gate: BOOKING_MODIFY (or owner short-circuit) per
 * docs/role-permissions-matrix.md.
 *
 * Result envelope: typed { success: true, ... } | { success: false, error }
 * — matches the convention used by the rest of the project and plays
 * nicely with showActionErrorToast() in components/feedback.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/guards";
import {
  hasStaffPermission,
  resolveTenantActorContext,
} from "@/lib/auth/staff-access";
import { logAudit } from "@/lib/services/audit";
import {
  checkAvailedServiceRemovable,
  recomputeTotalsAfterRemoval,
  rejectionMessage,
  type RemovableServiceRejection,
} from "@/lib/services/booking-modify";
import { publishEvent } from "@/lib/services/outbox";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

const removeBookingServiceSchema = z.object({
  bookingId: z.coerce.number().int().positive(),
  availedServiceId: z.coerce.number().int().positive(),
});

export type RemoveBookingServiceResult =
  | {
      success: true;
      bookingId: number;
      removedAvailedServiceId: number;
      newGrandTotal: number;
      newTotalDiscount: number;
    }
  | {
      success: false;
      error: string;
      /**
       * Stable code for clients that want to branch UX (e.g. show a
       * "go cancel the booking instead" link when LAST_REMAINING_SERVICE).
       */
      code?: RemovableServiceRejection | "Forbidden" | "Unauthorized" | "InvalidInput";
    };

export async function removeBookingServiceAction(
  input: z.input<typeof removeBookingServiceSchema>,
): Promise<RemoveBookingServiceResult> {
  const validation = removeBookingServiceSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }

  const auth = await requireAuth({ write: true });
  if (!auth.success) {
    return {
      success: false,
      error: auth.error,
      code: auth.error === "Unauthorized" ? "Unauthorized" : undefined,
    };
  }

  const actorContext = await resolveTenantActorContext(
    auth.businessSlug,
    auth.session.user.id,
  );
  if (!actorContext.success) {
    return { success: false, error: actorContext.error, code: "Forbidden" };
  }

  if (!hasStaffPermission(actorContext, StaffPermission.BOOKING_MODIFY)) {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Load the booking + the target line, scoped to actor's business.
      // The {actorContext.businessSlug}/{bookingId} pair is the security
      // boundary; the availedServiceId is then validated against the
      // loaded booking's lines.
      const booking = await tx.booking.findFirst({
        where: {
          id: validation.data.bookingId,
          business: { slug: actorContext.businessSlug },
        },
        select: {
          id: true,
          business_id: true,
          status: true,
          amount_paid: true,
          payment_status: true,
          grand_total: true,
          total_discount: true,
          customer: { select: { name: true, email: true } },
          availed_services: {
            select: {
              id: true,
              status: true,
              final_price: true,
              discount: true,
              service: { select: { name: true } },
            },
          },
        },
      });

      const guard = checkAvailedServiceRemovable({
        bookingId: validation.data.bookingId,
        booking,
        availedServiceId: validation.data.availedServiceId,
      });

      if (!guard.ok) {
        return {
          success: false as const,
          error: rejectionMessage(guard.reason),
          code: guard.reason,
        };
      }

      // After the guard passes, booking is non-null and the target line
      // is on it. Type narrowing isn't automatic across the helper
      // boundary, so we re-find here for the strong reference.
      const lineToRemove = booking!.availed_services.find(
        (s) => s.id === validation.data.availedServiceId,
      )!;

      const totals = recomputeTotalsAfterRemoval({
        currentGrandTotal: booking!.grand_total,
        currentTotalDiscount: booking!.total_discount,
        removedLine: {
          final_price: lineToRemove.final_price,
          discount: lineToRemove.discount,
        },
      });

      // Delete the line. AvailedService has no children that cascade
      // back to the booking total — only its own row is removed.
      await tx.availedService.delete({
        where: { id: lineToRemove.id },
      });

      const updatedBooking = await tx.booking.update({
        where: { id: booking!.id },
        data: {
          grand_total: totals.grandTotal,
          total_discount: totals.totalDiscount,
        },
        select: { id: true, grand_total: true, total_discount: true },
      });

      await logAudit(tx, {
        entityType: "Booking",
        entityId: String(booking!.id),
        action: "UPDATED",
        actorId: actorContext.userId,
        actorType: "USER",
        businessId: booking!.business_id,
        changes: {
          before: {
            grand_total: booking!.grand_total,
            total_discount: booking!.total_discount,
            availed_services_count: booking!.availed_services.length,
          },
          after: {
            grand_total: updatedBooking.grand_total,
            total_discount: updatedBooking.total_discount,
            availed_services_count: booking!.availed_services.length - 1,
            removed_availed_service_id: lineToRemove.id,
            removed_service_name: lineToRemove.service.name,
            removed_final_price: lineToRemove.final_price,
            mode: "REMOVE_SERVICE",
          },
        },
      });

      await publishEvent(tx, {
        type: "BOOKING_SERVICE_REMOVED",
        aggregateType: "Booking",
        aggregateId: String(booking!.id),
        businessId: booking!.business_id,
        payload: {
          bookingId: booking!.id,
          availedServiceId: lineToRemove.id,
          serviceName: lineToRemove.service.name,
          refundAmount: lineToRemove.final_price,
          newGrandTotal: updatedBooking.grand_total,
          actorUserId: actorContext.userId,
          customerName: booking!.customer?.name ?? null,
          email: booking!.customer?.email ?? null,
        },
      });

      revalidatePath(`/app/${auth.businessSlug}`);
      revalidatePath(`/app/${auth.businessSlug}/bookings`);

      return {
        success: true as const,
        bookingId: booking!.id,
        removedAvailedServiceId: lineToRemove.id,
        newGrandTotal: updatedBooking.grand_total,
        newTotalDiscount: updatedBooking.total_discount,
      };
    });
  } catch (error) {
    // Anything not caught by the typed guards above is treated as a
    // real failure. Sentry / logging will surface it; the user gets a
    // generic message rather than an internal stack trace.
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
