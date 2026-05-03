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
import { appendServicesToUntouchedBookingInTx } from "@/lib/services/booking-addons";
import {
  applyRescheduleShift,
  cancelRejectionMessage,
  checkAvailedServiceReassignable,
  checkAvailedServiceRemovable,
  checkBookingCancellable,
  checkBookingPriceAdjustable,
  checkBookingReschedulable,
  priceAdjustRejectionMessage,
  reassignRejectionMessage,
  recomputeTotalsAfterRemoval,
  rejectionMessage,
  rescheduleRejectionMessage,
  type CancelRejection,
  type PriceAdjustRejection,
  type ReassignRejection,
  type RemovableServiceRejection,
  type RescheduleRejection,
} from "@/lib/services/booking-modify";
import { publishEvent } from "@/lib/services/outbox";
import {
  Prisma,
  StaffPermission,
} from "@/prisma/generated/prisma/client";
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

// ─── Swap action ────────────────────────────────────────────────────

const swapBookingServiceSchema = z.object({
  bookingId: z.coerce.number().int().positive(),
  availedServiceId: z.coerce.number().int().positive(),
  newServiceId: z.coerce.number().int().positive(),
  newPackageId: z.coerce.number().int().positive().optional(),
  claimedByCurrentEmployee: z.boolean().optional(),
});

export type SwapBookingServiceResult =
  | {
      success: true;
      bookingId: number;
      removedAvailedServiceId: number;
      addedServiceId: number;
    }
  | {
      success: false;
      error: string;
      code?:
        | RemovableServiceRejection
        | "Forbidden"
        | "Unauthorized"
        | "InvalidInput"
        | "BOOKING_STATE_CHANGED";
    };

/**
 * Swap a single PENDING service line for a different service in one
 * transaction. Composes a delete with the existing append helper
 * (appendServicesToUntouchedBookingInTx) so the booking goes through
 * exactly one consistent state change.
 *
 * Only valid when the booking is in APPEND mode (ACCEPTED + unpaid +
 * no started services). For any other mode the user should remove the
 * line manually (or refund + remove for paid bookings) and add the new
 * service via the existing add-on flow, which routes to FOLLOW_UP
 * automatically.
 */
export async function swapBookingServiceAction(
  input: z.input<typeof swapBookingServiceSchema>,
): Promise<SwapBookingServiceResult> {
  const validation = swapBookingServiceSchema.safeParse(input);
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

  // Resolve the initiator employeeId — when an employee swaps and asks
  // to claim the new line, only their own employeeId is permitted.
  const initiatorEmployeeId =
    actorContext.actorType === "EMPLOYEE" ? actorContext.employeeId : undefined;

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Load booking + target line, scoped to actor's business.
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

        const lineToRemove = booking!.availed_services.find(
          (s) => s.id === validation.data.availedServiceId,
        )!;

        const grandTotalBeforeAppend =
          recomputeTotalsAfterRemoval({
            currentGrandTotal: booking!.grand_total,
            currentTotalDiscount: booking!.total_discount,
            removedLine: {
              final_price: lineToRemove.final_price,
              discount: lineToRemove.discount,
            },
          }).grandTotal;

        // Step 1: delete the old line.
        await tx.availedService.delete({
          where: { id: lineToRemove.id },
        });

        // Step 2: shrink booking totals so the append helper sees a
        // consistent base. The helper recomputes grand_total by adding
        // the new line's final_price on top of the booking's current
        // grand_total — if we didn't shrink first, the swap would
        // double-count.
        await tx.booking.update({
          where: { id: booking!.id },
          data: {
            grand_total: grandTotalBeforeAppend,
            total_discount: recomputeTotalsAfterRemoval({
              currentGrandTotal: booking!.grand_total,
              currentTotalDiscount: booking!.total_discount,
              removedLine: {
                final_price: lineToRemove.final_price,
                discount: lineToRemove.discount,
              },
            }).totalDiscount,
          },
        });

        // Step 3: append the new service via the shared helper.
        await appendServicesToUntouchedBookingInTx(tx, {
          bookingId: booking!.id,
          actorContext,
          services: [
            {
              id: validation.data.newServiceId,
              quantity: 1,
              packageId: validation.data.newPackageId,
              claimedByCurrentEmployee:
                validation.data.claimedByCurrentEmployee ?? false,
            },
          ],
          currentEmployeeId: initiatorEmployeeId ?? undefined,
        });

        // Re-read the booking + the newly added service line to get the
        // final state for audit / outbox.
        const finalBooking = await tx.booking.findFirstOrThrow({
          where: { id: booking!.id },
          select: { grand_total: true },
        });
        const addedLine = await tx.availedService.findFirstOrThrow({
          where: {
            booking_id: booking!.id,
            service_id: validation.data.newServiceId,
          },
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            service: { select: { id: true, name: true } },
          },
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
              removed_availed_service_id: lineToRemove.id,
              removed_service_name: lineToRemove.service.name,
              mode: "SWAP_SERVICE",
            },
            after: {
              grand_total: finalBooking.grand_total,
              added_service_id: addedLine.service.id,
              added_service_name: addedLine.service.name,
              mode: "SWAP_SUCCESS",
            },
          },
        });

        await publishEvent(tx, {
          type: "BOOKING_SERVICE_SWAPPED",
          aggregateType: "Booking",
          aggregateId: String(booking!.id),
          businessId: booking!.business_id,
          payload: {
            bookingId: booking!.id,
            removedAvailedServiceId: lineToRemove.id,
            removedServiceName: lineToRemove.service.name,
            addedServiceId: addedLine.service.id,
            addedServiceName: addedLine.service.name,
            priceDelta:
              Math.round((finalBooking.grand_total - booking!.grand_total) * 100) /
              100,
            newGrandTotal: finalBooking.grand_total,
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
          addedServiceId: addedLine.service.id,
        };
      },
      {
        // Same isolation level as the underlying append helper.
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    // Race: another mutation moved the booking out of APPEND mode after
    // our snapshot. Surfaces as "BOOKING_STATE_CHANGED" from the helper.
    if (error instanceof Error && error.message === "BOOKING_STATE_CHANGED") {
      return {
        success: false,
        error:
          "This booking changed while you were editing it. Refresh and try again.",
        code: "BOOKING_STATE_CHANGED",
      };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ─── Reschedule action ─────────────────────────────────────────────

const rescheduleBookingSchema = z.object({
  bookingId: z.coerce.number().int().positive(),
  // ISO-8601 string from the client; coerced to Date here.
  newScheduledAt: z.coerce.date(),
});

export type RescheduleBookingResult =
  | {
      success: true;
      bookingId: number;
      oldScheduledAt: string;
      newScheduledAt: string;
      newEstimatedEnd: string | null;
    }
  | {
      success: false;
      error: string;
      code?:
        | RescheduleRejection
        | "Forbidden"
        | "Unauthorized"
        | "InvalidInput";
    };

/**
 * Move an ACCEPTED booking to a new scheduled time. Shifts each service
 * line by the same delta so relative spacing is preserved (no
 * re-pricing, no duration lookup). Permission: BOOKING_MODIFY.
 *
 * Customer notification is fired via the BOOKING_RESCHEDULED outbox
 * event; the delivery handler is expected to send the SMS/email — this
 * action does not call the messaging providers directly.
 */
export async function rescheduleBookingAction(
  input: z.input<typeof rescheduleBookingSchema>,
): Promise<RescheduleBookingResult> {
  const validation = rescheduleBookingSchema.safeParse(input);
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
      const booking = await tx.booking.findFirst({
        where: {
          id: validation.data.bookingId,
          business: { slug: actorContext.businessSlug },
        },
        select: {
          id: true,
          business_id: true,
          status: true,
          scheduled_at: true,
          estimated_end: true,
          customer: { select: { name: true, email: true, phone: true } },
          availed_services: {
            select: {
              id: true,
              status: true,
              scheduled_at: true,
              estimated_end: true,
            },
          },
        },
      });

      const guard = checkBookingReschedulable({
        booking,
        newScheduledAt: validation.data.newScheduledAt,
      });
      if (!guard.ok) {
        return {
          success: false as const,
          error: rescheduleRejectionMessage(guard.reason),
          code: guard.reason,
        };
      }

      // Type narrowing isn't carried across the helper boundary.
      // booking is non-null and has scheduled_at after a successful guard.
      const oldScheduledAt = booking!.scheduled_at!;
      const shift = applyRescheduleShift({
        oldScheduledAt,
        newScheduledAt: validation.data.newScheduledAt,
        oldEstimatedEnd: booking!.estimated_end,
        lines: booking!.availed_services.map((line) => ({
          id: line.id,
          scheduled_at: line.scheduled_at,
          estimated_end: line.estimated_end,
        })),
      });

      // Update each AvailedService line. We do this serially inside
      // the transaction; the update count is bounded by the booking's
      // service count (typically 1-5).
      for (const shifted of shift.shiftedLines) {
        await tx.availedService.update({
          where: { id: shifted.id },
          data: {
            scheduled_at: shifted.scheduled_at,
            estimated_end: shifted.estimated_end,
          },
        });
      }

      const updatedBooking = await tx.booking.update({
        where: { id: booking!.id },
        data: {
          scheduled_at: validation.data.newScheduledAt,
          estimated_end: shift.newEstimatedEnd,
          // Reset reminder_sent so the rescheduled booking is eligible
          // for a fresh reminder at the new time.
          reminder_sent: false,
        },
        select: {
          id: true,
          scheduled_at: true,
          estimated_end: true,
        },
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
            scheduled_at: oldScheduledAt.toISOString(),
            estimated_end: booking!.estimated_end?.toISOString() ?? null,
            mode: "RESCHEDULE_ATTEMPT",
          },
          after: {
            scheduled_at: validation.data.newScheduledAt.toISOString(),
            estimated_end: shift.newEstimatedEnd?.toISOString() ?? null,
            delta_ms: shift.deltaMs,
            mode: "RESCHEDULE_SUCCESS",
          },
        },
      });

      await publishEvent(tx, {
        type: "BOOKING_RESCHEDULED",
        aggregateType: "Booking",
        aggregateId: String(booking!.id),
        businessId: booking!.business_id,
        payload: {
          bookingId: booking!.id,
          oldScheduledAt: oldScheduledAt.toISOString(),
          newScheduledAt: validation.data.newScheduledAt.toISOString(),
          oldEstimatedEnd: booking!.estimated_end?.toISOString(),
          newEstimatedEnd: shift.newEstimatedEnd?.toISOString(),
          actorUserId: actorContext.userId,
          customerName: booking!.customer?.name ?? null,
          email: booking!.customer?.email ?? null,
          phone: booking!.customer?.phone ?? null,
        },
      });

      revalidatePath(`/app/${auth.businessSlug}`);
      revalidatePath(`/app/${auth.businessSlug}/bookings`);

      return {
        success: true as const,
        bookingId: booking!.id,
        oldScheduledAt: oldScheduledAt.toISOString(),
        newScheduledAt:
          updatedBooking.scheduled_at?.toISOString() ??
          validation.data.newScheduledAt.toISOString(),
        newEstimatedEnd: updatedBooking.estimated_end?.toISOString() ?? null,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ─── Staff reassign action ────────────────────────────────────────

const reassignBookingStaffSchema = z.object({
  availedServiceId: z.coerce.number().int().positive(),
  newEmployeeId: z.coerce.number().int().positive(),
});

export type ReassignBookingStaffResult =
  | {
      success: true;
      bookingId: number;
      availedServiceId: number;
      newEmployeeId: number;
    }
  | {
      success: false;
      error: string;
      code?:
        | ReassignRejection
        | "Forbidden"
        | "Unauthorized"
        | "InvalidInput";
    };

/**
 * Reassign a single AvailedService line to a different employee.
 * Permission: QUEUE_OVERRIDE_ALL — managers and owners (owners
 * short-circuit). The new employee must belong to the actor's
 * business; cross-tenant assignment is impossible by construction.
 *
 * State machine: only PENDING and CLAIMED lines are reassignable.
 * Once SERVING/COMPLETED the staffing is settled and reassign is
 * rejected. CANCELLED lines have their own reason.
 *
 * Internal-only — no customer notification (per matrix). The outbox
 * event drives manager dashboard activity feeds and audit visibility.
 */
export async function reassignBookingStaffAction(
  input: z.input<typeof reassignBookingStaffSchema>,
): Promise<ReassignBookingStaffResult> {
  const validation = reassignBookingStaffSchema.safeParse(input);
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

  if (!hasStaffPermission(actorContext, StaffPermission.QUEUE_OVERRIDE_ALL)) {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Load the AvailedService scoped to actor's business via its
      // booking. Anything not in the same business returns null and
      // is rejected by the helper.
      const availedService = await tx.availedService.findFirst({
        where: {
          id: validation.data.availedServiceId,
          booking: { business: { slug: actorContext.businessSlug } },
        },
        select: {
          id: true,
          status: true,
          served_by_id: true,
          served_by_owner_id: true,
          booking_id: true,
          booking: { select: { business_id: true } },
          service: { select: { name: true } },
          served_by: {
            select: {
              id: true,
              user: { select: { name: true } },
            },
          },
        },
      });

      const guard = checkAvailedServiceReassignable({
        availedService,
        newEmployeeId: validation.data.newEmployeeId,
      });
      if (!guard.ok) {
        return {
          success: false as const,
          error: reassignRejectionMessage(guard.reason),
          code: guard.reason,
        };
      }

      // Verify the new employee is in this business.
      const newEmployee = await tx.employee.findFirst({
        where: {
          id: validation.data.newEmployeeId,
          business_id: availedService!.booking.business_id,
        },
        select: {
          id: true,
          user: { select: { name: true } },
        },
      });
      if (!newEmployee) {
        return {
          success: false as const,
          error: reassignRejectionMessage("EMPLOYEE_NOT_FOUND"),
          code: "EMPLOYEE_NOT_FOUND",
        };
      }

      const oldEmployeeId = availedService!.served_by_id ?? null;
      const oldOwnerId = availedService!.served_by_owner_id ?? null;
      const oldStaffName = availedService!.served_by?.user?.name ?? null;
      const wasPending =
        availedService!.status === "PENDING" ||
        (!availedService!.served_by_id && !availedService!.served_by_owner_id);
      const claimedAt = wasPending ? new Date() : undefined;

      await tx.availedService.update({
        where: { id: availedService!.id },
        data: {
          served_by_id: newEmployee.id,
          served_by_owner_id: null,
          served_by_type: "EMPLOYEE",
          // If the line was PENDING, reassignment also claims it.
          // If it was CLAIMED, keep the existing claim status; only
          // the assignee changes.
          status: wasPending ? "CLAIMED" : availedService!.status,
          claimed_at: claimedAt ?? undefined,
        },
      });

      await logAudit(tx, {
        entityType: "Booking",
        entityId: String(availedService!.booking_id),
        action: "UPDATED",
        actorId: actorContext.userId,
        actorType: "USER",
        businessId: availedService!.booking.business_id,
        changes: {
          before: {
            availed_service_id: availedService!.id,
            served_by_employee_id: oldEmployeeId,
            served_by_owner_id: oldOwnerId,
            mode: "REASSIGN_STAFF_ATTEMPT",
          },
          after: {
            availed_service_id: availedService!.id,
            served_by_employee_id: newEmployee.id,
            served_by_owner_id: null,
            mode: "REASSIGN_STAFF_SUCCESS",
          },
        },
      });

      await publishEvent(tx, {
        type: "BOOKING_STAFF_REASSIGNED",
        aggregateType: "Booking",
        aggregateId: String(availedService!.booking_id),
        businessId: availedService!.booking.business_id,
        payload: {
          bookingId: availedService!.booking_id,
          availedServiceId: availedService!.id,
          serviceName: availedService!.service.name,
          oldEmployeeId,
          oldOwnerId,
          oldStaffName,
          newEmployeeId: newEmployee.id,
          newStaffName: newEmployee.user.name,
          actorUserId: actorContext.userId,
        },
      });

      revalidatePath(`/app/${auth.businessSlug}`);
      revalidatePath(`/app/${auth.businessSlug}/bookings`);

      return {
        success: true as const,
        bookingId: availedService!.booking_id,
        availedServiceId: availedService!.id,
        newEmployeeId: newEmployee.id,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ─── Price adjust action ──────────────────────────────────────────

const adjustBookingPriceSchema = z.object({
  bookingId: z.coerce.number().int().positive(),
  /** Optional. When provided, the adjustment targets a specific service line. */
  availedServiceId: z.coerce.number().int().positive().optional(),
  /** Negative for discount, positive for surcharge. Must be non-zero. */
  deltaAmount: z.coerce.number().finite(),
  /** Required reason — surfaces in audit trail and customer receipt. */
  reason: z.string().trim().min(1).max(500),
});

export type AdjustBookingPriceResult =
  | {
      success: true;
      bookingId: number;
      availedServiceId: number | null;
      deltaAmount: number;
      newGrandTotal: number;
      adjustmentId: string;
    }
  | {
      success: false;
      error: string;
      code?:
        | PriceAdjustRejection
        | "Forbidden"
        | "Unauthorized"
        | "InvalidInput";
    };

/**
 * Apply a manual price adjustment to a booking. Writes a permanent
 * BookingPriceAdjustment row (the audit trail of why) and shifts the
 * booking's grand_total by the delta. When the adjustment targets a
 * specific service line, the line's final_price is also shifted so
 * line-level totals stay consistent with the booking total.
 *
 * Permission: BOOKING_ADJUST_PRICE (managers + owners by default).
 * Customer-visible side effect: updated receipt, fired via the
 * BOOKING_PRICE_ADJUSTED outbox event.
 */
export async function adjustBookingPriceAction(
  input: z.input<typeof adjustBookingPriceSchema>,
): Promise<AdjustBookingPriceResult> {
  const validation = adjustBookingPriceSchema.safeParse(input);
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

  if (!hasStaffPermission(actorContext, StaffPermission.BOOKING_ADJUST_PRICE)) {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id: validation.data.bookingId,
          business: { slug: actorContext.businessSlug },
        },
        select: {
          id: true,
          business_id: true,
          status: true,
          payment_status: true,
          grand_total: true,
          customer: { select: { name: true, email: true, phone: true } },
          availed_services: {
            select: {
              id: true,
              final_price: true,
              discount: true,
            },
          },
        },
      });

      const guard = checkBookingPriceAdjustable({
        booking,
        availedServiceId: validation.data.availedServiceId,
        deltaAmount: validation.data.deltaAmount,
        reason: validation.data.reason,
      });
      if (!guard.ok) {
        return {
          success: false as const,
          error: priceAdjustRejectionMessage(guard.reason),
          code: guard.reason,
        };
      }

      const oldGrandTotal = booking!.grand_total;
      const newGrandTotal = guard.resultingGrandTotal;

      // Record the adjustment as an append-only audit row with the
      // reason. This is the primary artifact — the booking and line
      // totals below are derived state we keep in sync for query speed.
      const adjustment = await tx.bookingPriceAdjustment.create({
        data: {
          booking_id: booking!.id,
          availed_service_id: validation.data.availedServiceId ?? null,
          delta_amount: validation.data.deltaAmount,
          reason: validation.data.reason.trim(),
          created_by_user_id: actorContext.userId,
        },
        select: { id: true },
      });

      // Shift booking grand_total by delta.
      await tx.booking.update({
        where: { id: booking!.id },
        data: { grand_total: newGrandTotal },
      });

      // If line-scoped, shift the line's final_price by the same delta
      // so the line and the booking stay consistent. discount is
      // updated symmetrically: a negative delta increases the recorded
      // discount on the line, a positive delta decreases it (clamping
      // at zero so we never store a negative discount).
      if (validation.data.availedServiceId !== undefined) {
        const targetLine = booking!.availed_services.find(
          (l) => l.id === validation.data.availedServiceId,
        )!;
        const newLineFinal = Math.max(
          0,
          Math.round(
            (targetLine.final_price + validation.data.deltaAmount) * 100,
          ) / 100,
        );
        const newLineDiscount = Math.max(
          0,
          Math.round((targetLine.discount - validation.data.deltaAmount) * 100) /
            100,
        );
        await tx.availedService.update({
          where: { id: targetLine.id },
          data: {
            final_price: newLineFinal,
            discount: newLineDiscount,
            discount_reason:
              validation.data.deltaAmount < 0 ? "MANUAL_ADJUSTMENT" : undefined,
          },
        });
      }

      await logAudit(tx, {
        entityType: "Booking",
        entityId: String(booking!.id),
        action: "PRICE_MODIFIED",
        actorId: actorContext.userId,
        actorType: "USER",
        businessId: booking!.business_id,
        changes: {
          before: { grand_total: oldGrandTotal },
          after: {
            grand_total: newGrandTotal,
            delta: validation.data.deltaAmount,
            availed_service_id: validation.data.availedServiceId ?? null,
            reason: validation.data.reason.trim(),
            adjustment_id: adjustment.id,
            mode: "PRICE_ADJUSTED",
          },
        },
      });

      await publishEvent(tx, {
        type: "BOOKING_PRICE_ADJUSTED",
        aggregateType: "Booking",
        aggregateId: String(booking!.id),
        businessId: booking!.business_id,
        payload: {
          bookingId: booking!.id,
          availedServiceId: validation.data.availedServiceId ?? null,
          deltaAmount: validation.data.deltaAmount,
          oldGrandTotal,
          newGrandTotal,
          reason: validation.data.reason.trim(),
          actorUserId: actorContext.userId,
          customerName: booking!.customer?.name ?? null,
          email: booking!.customer?.email ?? null,
          phone: booking!.customer?.phone ?? null,
        },
      });

      revalidatePath(`/app/${auth.businessSlug}`);
      revalidatePath(`/app/${auth.businessSlug}/bookings`);

      return {
        success: true as const,
        bookingId: booking!.id,
        availedServiceId: validation.data.availedServiceId ?? null,
        deltaAmount: validation.data.deltaAmount,
        newGrandTotal,
        adjustmentId: adjustment.id,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ─── Cancel action ───────────────────────────────────────────────

const cancelBookingSchema = z.object({
  bookingId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});

export type CancelBookingResult =
  | {
      success: true;
      bookingId: number;
      cancelledAt: string;
    }
  | {
      success: false;
      error: string;
      code?: CancelRejection | "Forbidden" | "Unauthorized" | "InvalidInput";
    };

/**
 * Soft-cancel a booking. Sets status=CANCELLED plus the dedicated
 * soft-cancel fields (cancelled_at, cancelled_by_id, cancellation_reason)
 * added in Phase 1. Recovery is intentionally a separate action — the
 * design calls for a 24h "uncancel" window, but the uncancel surface
 * lives outside this PR.
 *
 * Permission: BOOKING_CANCEL (managers + owners; owners short-circuit).
 * Customer-visible: yes — fires the existing BOOKING_CANCELLED outbox
 * event (with the new optional actorUserId field set so delivery
 * handlers can distinguish staff-initiated cancellations from system
 * ones like expired holds).
 */
export async function cancelBookingAction(
  input: z.input<typeof cancelBookingSchema>,
): Promise<CancelBookingResult> {
  const validation = cancelBookingSchema.safeParse(input);
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

  if (!hasStaffPermission(actorContext, StaffPermission.BOOKING_CANCEL)) {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id: validation.data.bookingId,
          business: { slug: actorContext.businessSlug },
        },
        select: {
          id: true,
          business_id: true,
          status: true,
          customer: { select: { name: true, email: true, phone: true } },
        },
      });

      const guard = checkBookingCancellable({
        booking,
        reason: validation.data.reason,
      });
      if (!guard.ok) {
        return {
          success: false as const,
          error: cancelRejectionMessage(guard.reason),
          code: guard.reason,
        };
      }

      const now = new Date();
      const trimmedReason = validation.data.reason.trim();
      const previousStatus = booking!.status;

      const updated = await tx.booking.update({
        where: { id: booking!.id },
        data: {
          status: "CANCELLED",
          cancelled_at: now,
          cancelled_by_id: actorContext.userId,
          cancellation_reason: trimmedReason,
        },
        select: { id: true, cancelled_at: true },
      });

      await logAudit(tx, {
        entityType: "Booking",
        entityId: String(booking!.id),
        action: "CANCELLED",
        actorId: actorContext.userId,
        actorType: "USER",
        businessId: booking!.business_id,
        changes: {
          before: {
            status: previousStatus,
            mode: "CANCEL_ATTEMPT",
          },
          after: {
            status: "CANCELLED",
            cancelled_at: updated.cancelled_at?.toISOString() ?? null,
            cancellation_reason: trimmedReason,
            mode: "CANCEL_SUCCESS",
          },
        },
      });

      await publishEvent(tx, {
        type: "BOOKING_CANCELLED",
        aggregateType: "Booking",
        aggregateId: String(booking!.id),
        businessId: booking!.business_id,
        payload: {
          bookingId: booking!.id,
          reason: trimmedReason,
          status: "CANCELLED",
          email: booking!.customer?.email ?? null,
          customerName: booking!.customer?.name ?? null,
          actorUserId: actorContext.userId,
          phone: booking!.customer?.phone ?? null,
        },
      });

      revalidatePath(`/app/${auth.businessSlug}`);
      revalidatePath(`/app/${auth.businessSlug}/bookings`);

      return {
        success: true as const,
        bookingId: booking!.id,
        cancelledAt: (updated.cancelled_at ?? now).toISOString(),
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

// ─── Add note action ─────────────────────────────────────────────

const addBookingNoteSchema = z.object({
  bookingId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1).max(2000),
  visibility: z.enum(["INTERNAL", "CUSTOMER_VISIBLE"]).default("INTERNAL"),
});

export type AddBookingNoteResult =
  | {
      success: true;
      bookingId: number;
      noteId: string;
      visibility: "INTERNAL" | "CUSTOMER_VISIBLE";
    }
  | {
      success: false;
      error: string;
      code?:
        | "BOOKING_NOT_FOUND"
        | "Forbidden"
        | "Unauthorized"
        | "InvalidInput";
    };

/**
 * Add a note to a booking. Notes are an append-only audit-friendly
 * artifact — there's no edit or delete in v1; that simplifies access
 * control (any role that could see the booking can record context for
 * future-themselves) and prevents tampering with the notes log.
 *
 * Permission model:
 *   - INTERNAL notes: any signed-in tenant user. The presence of a
 *     valid {@link resolveTenantActorContext} success branch means the
 *     actor belongs to this business; that's sufficient.
 *   - CUSTOMER_VISIBLE notes: require BOOKING_MODIFY. These notes
 *     surface to the customer in their booking page, so they're
 *     effectively a customer-facing edit and need the same gate as
 *     other booking-content changes.
 */
export async function addBookingNoteAction(
  input: z.input<typeof addBookingNoteSchema>,
): Promise<AddBookingNoteResult> {
  const validation = addBookingNoteSchema.safeParse(input);
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

  // Customer-visible notes need a stronger gate.
  if (
    validation.data.visibility === "CUSTOMER_VISIBLE" &&
    !hasStaffPermission(actorContext, StaffPermission.BOOKING_MODIFY)
  ) {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Verify the booking exists and is in the actor's business.
      const booking = await tx.booking.findFirst({
        where: {
          id: validation.data.bookingId,
          business: { slug: actorContext.businessSlug },
        },
        select: { id: true, business_id: true },
      });
      if (!booking) {
        return {
          success: false as const,
          error: "Booking not found.",
          code: "BOOKING_NOT_FOUND",
        };
      }

      const trimmedBody = validation.data.body.trim();

      const note = await tx.bookingNote.create({
        data: {
          booking_id: booking.id,
          body: trimmedBody,
          visibility: validation.data.visibility,
          created_by_user_id: actorContext.userId,
        },
        select: { id: true },
      });

      await logAudit(tx, {
        entityType: "Booking",
        entityId: String(booking.id),
        action: "UPDATED",
        actorId: actorContext.userId,
        actorType: "USER",
        businessId: booking.business_id,
        changes: {
          before: {},
          after: {
            note_id: note.id,
            visibility: validation.data.visibility,
            // Avoid logging the entire body in the audit JSON; the
            // BookingNote row is the system of record for the body.
            body_length: trimmedBody.length,
            mode: "NOTE_ADDED",
          },
        },
      });

      await publishEvent(tx, {
        type: "BOOKING_NOTE_ADDED",
        aggregateType: "Booking",
        aggregateId: String(booking.id),
        businessId: booking.business_id,
        payload: {
          bookingId: booking.id,
          noteId: note.id,
          visibility: validation.data.visibility,
          bodyPreview:
            trimmedBody.length > 140
              ? `${trimmedBody.slice(0, 139)}…`
              : trimmedBody,
          actorUserId: actorContext.userId,
        },
      });

      revalidatePath(`/app/${auth.businessSlug}`);
      revalidatePath(`/app/${auth.businessSlug}/bookings`);

      return {
        success: true as const,
        bookingId: booking.id,
        noteId: note.id,
        visibility: validation.data.visibility,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
