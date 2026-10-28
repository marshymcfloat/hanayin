import { prisma } from "@/prisma/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { publishEvent } from "@/lib/services/outbox";
import { getBookingLifecycleEventType } from "@/features/bookings/services/booking-event-policy";
import { logAudit } from "@/lib/services/audit";
import { validateBookingOrThrow } from "@/features/bookings/services/booking-availability";
import type { GcashResolutionOutcome } from "@/lib/types/manual-gcash";

const DEPOSIT_PERCENTAGE = 20;

export async function submitGcashPayment(input: {
  bookingId: number;
  businessSlug: string;
  payerName: string | null;
  reference: string | null;
  now: Date;
  expiresAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.bookingPayment.findFirst({
      where: { booking_id: input.bookingId, status: "PENDING" },
      include: { booking: { include: { business: true } } },
      orderBy: { created_at: "desc" },
    });
    if (!payment || payment.booking.business.slug !== input.businessSlug) {
      throw new Error("PAYMENT_NOT_FOUND");
    }
    if (payment.submitted_at) {
      return { duplicateReference: false, idempotent: true };
    }
    if (
      payment.booking.status !== "HOLD" ||
      !payment.expires_at ||
      payment.expires_at <= input.now
    ) {
      throw new Error("HOLD_EXPIRED");
    }

    const duplicateReference = input.reference
      ? (await tx.bookingPayment.count({
          where: {
            id: { not: payment.id },
            provider_reference: input.reference,
            booking: { business_id: payment.booking.business_id },
          },
        })) > 0
      : false;

    const updated = await tx.bookingPayment.updateMany({
      where: { id: payment.id, status: "PENDING", submitted_at: null },
      data: {
        payer_name: input.payerName,
        provider_reference: input.reference,
        submitted_at: input.now,
        expires_at: input.expiresAt,
      },
    });
    if (updated.count === 0) {
      return { duplicateReference, idempotent: true };
    }
    await tx.booking.update({
      where: { id: input.bookingId },
      data: { hold_expires_at: input.expiresAt },
    });
    return { duplicateReference, idempotent: false };
  });
}

export async function approveGcashPayment(input: {
  paymentId: number;
  businessSlug: string;
  businessId: string;
  actorUserId: string;
  source: "CUSTOMER_SUBMITTED" | "OWNER_VERIFIED_WITHOUT_SUBMISSION";
  attestation: {
    transactionFound: true;
    recipientMatched: true;
    amountMatched: true;
    detailsReviewed: true;
  };
  now: Date;
}) {
  return prisma.$transaction(
    async (tx) => {
      const payment = await tx.bookingPayment.findFirst({
        where: {
          id: input.paymentId,
          status: "PENDING",
          submitted_at:
            input.source === "CUSTOMER_SUBMITTED" ? { not: null } : null,
          booking: {
            business_id: input.businessId,
            business: { slug: input.businessSlug },
            status: "HOLD",
          },
        },
        include: {
          booking: {
            include: {
              customer: true,
              business: true,
              availed_services: { include: { service: true } },
            },
          },
        },
      });
      if (!payment || !payment.expires_at || payment.expires_at <= input.now) {
        throw new Error("NOT_REVIEWABLE");
      }
      const expectedDeposit =
        Math.round(payment.booking.grand_total * DEPOSIT_PERCENTAGE) / 100;
      if (Math.abs(payment.amount_principal - expectedDeposit) > 0.009) {
        throw new Error("AMOUNT_CHANGED");
      }

      const locked = await tx.booking.updateMany({
        where: {
          id: payment.booking_id,
          business_id: input.businessId,
          status: "HOLD",
          hold_expires_at: { gt: input.now },
        },
        data: { status: "CANCELLED" },
      });
      if (locked.count !== 1) throw new Error("NOT_REVIEWABLE");

      const serviceCounts = new Map<number, number>();
      for (const item of payment.booking.availed_services) {
        serviceCounts.set(
          item.service_id,
          (serviceCounts.get(item.service_id) ?? 0) + 1,
        );
      }
      const assignedEmployeeIds = Array.from(
        new Set(
          payment.booking.availed_services
            .map((item) => item.served_by_id)
            .filter((id): id is number => id !== null),
        ),
      );
      if (!payment.booking.scheduled_at) throw new Error("SLOT_INVALID");
      await validateBookingOrThrow({
        businessSlug: input.businessSlug,
        scheduledAt: payment.booking.scheduled_at,
        services: Array.from(serviceCounts, ([id, quantity]) => ({
          id,
          quantity,
        })),
        paymentType: "DOWNPAYMENT",
        isPublicBooking: true,
        selectedEmployeeId:
          assignedEmployeeIds.length === 1 ? assignedEmployeeIds[0] : undefined,
        staffSelectionMode:
          assignedEmployeeIds.length === 1
            ? "REQUIRE_SELECTED"
            : "ANY_AVAILABLE",
        now: payment.booking.created_at,
        db: tx,
      });

      const changed = await tx.bookingPayment.updateMany({
        where: {
          id: payment.id,
          status: "PENDING",
          verified_at: null,
          booking: { business_id: input.businessId },
        },
        data: {
          status: "SUCCEEDED",
          paid_at: input.now,
          verified_at: input.now,
          verified_by_user_id: input.actorUserId,
        },
      });
      if (changed.count !== 1) throw new Error("NOT_REVIEWABLE");
      const accepted = await tx.booking.updateMany({
        where: {
          id: payment.booking_id,
          business_id: input.businessId,
          status: "CANCELLED",
        },
        data: {
          status: "ACCEPTED",
          payment_status: "PARTIALLY_PAID",
          amount_paid: payment.amount_principal,
          downpayment: payment.amount_principal,
          downpayment_date: input.now,
          hold_expires_at: null,
        },
      });
      if (accepted.count !== 1) throw new Error("NOT_REVIEWABLE");
      await logAudit(tx, {
        entityType: "BookingPayment",
        entityId: String(payment.id),
        action: "APPROVED",
        actorId: input.actorUserId,
        businessId: payment.booking.business_id,
        changes: {
          before: { status: "PENDING" },
          after: {
            status: "SUCCEEDED",
            attestation: input.attestation,
            source: input.source,
          },
        },
      });
      const confirmationEvent = await publishEvent(
        tx as Prisma.TransactionClient,
        {
          type: getBookingLifecycleEventType("PUBLIC_PAYMENT_OWNER_APPROVED"),
          aggregateType: "Booking",
          aggregateId: String(payment.booking_id),
          businessId: payment.booking.business_id,
          dedupeKey: `BOOKING_CONFIRMED:Booking:${payment.booking_id}`,
          payload: {
            bookingId: payment.booking_id,
            customerName: payment.booking.customer?.name,
            email: payment.booking.customer?.email,
            scheduledAt: payment.booking.scheduled_at?.toISOString(),
            estimatedEnd: payment.booking.estimated_end?.toISOString(),
            grandTotal: payment.booking.grand_total,
            status: "ACCEPTED",
          },
        },
      );
      return confirmationEvent.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function rejectGcashPayment(input: {
  paymentId: number;
  businessSlug: string;
  businessId: string;
  actorUserId: string;
  rejectionReason: string;
  internalNote: string | null;
  now: Date;
}) {
  return prisma.$transaction(
    async (tx) => {
      const payment = await tx.bookingPayment.findFirst({
        where: {
          id: input.paymentId,
          status: "PENDING",
          submitted_at: { not: null },
          booking: {
            business_id: input.businessId,
            business: { slug: input.businessSlug },
            status: "HOLD",
          },
        },
        include: { booking: { include: { customer: true } } },
      });
      if (!payment) throw new Error("NOT_REVIEWABLE");
      const cancelled = await tx.booking.updateMany({
        where: {
          id: payment.booking_id,
          business_id: input.businessId,
          status: "HOLD",
        },
        data: {
          status: "CANCELLED",
          cancelled_at: input.now,
          cancelled_by_id: input.actorUserId,
          cancellation_reason: input.rejectionReason,
          hold_expires_at: null,
        },
      });
      if (cancelled.count !== 1) throw new Error("NOT_REVIEWABLE");
      const changed = await tx.bookingPayment.updateMany({
        where: {
          id: payment.id,
          status: "PENDING",
          verified_at: null,
          booking: { business_id: input.businessId },
        },
        data: {
          status: "FAILED",
          verified_at: input.now,
          verified_by_user_id: input.actorUserId,
          rejection_reason: input.rejectionReason,
          resolution_note: input.internalNote,
          resolution_resolved_at: input.now,
          resolution_outcome: "NO_PAYMENT_FOUND",
        },
      });
      if (changed.count !== 1) throw new Error("NOT_REVIEWABLE");
      await tx.availedService.updateMany({
        where: {
          booking_id: payment.booking_id,
          status: { not: "COMPLETED" },
        },
        data: { status: "CANCELLED", cancelled_at: input.now },
      });
      await tx.voucher.updateMany({
        where: { used_by_id: payment.booking_id },
        data: { used_by_id: null, is_active: true },
      });
      await logAudit(tx, {
        entityType: "BookingPayment",
        entityId: String(payment.id),
        action: "REJECTED",
        actorId: input.actorUserId,
        businessId: input.businessId,
        changes: {
          before: { status: "PENDING" },
          after: {
            status: "FAILED",
            reason: input.rejectionReason,
            internalNote: input.internalNote,
          },
        },
      });
      await publishEvent(tx as Prisma.TransactionClient, {
        type: "BOOKING_CANCELLED",
        aggregateType: "Booking",
        aggregateId: String(payment.booking_id),
        businessId: input.businessId,
        payload: {
          bookingId: payment.booking_id,
          reason: input.rejectionReason,
          status: "CANCELLED",
          email: payment.booking.customer?.email,
          phone: payment.booking.customer?.phone,
          customerName: payment.booking.customer?.name,
          actorUserId: input.actorUserId,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function escalateGcashPayment(input: {
  paymentId: number;
  businessSlug: string;
  businessId: string;
  actorUserId: string;
  reason: string;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.bookingPayment.updateMany({
      where: {
        id: input.paymentId,
        status: "PENDING",
        submitted_at: { not: null },
        escalated_at: null,
        expires_at: { gt: input.now },
        booking: {
          business_id: input.businessId,
          business: { slug: input.businessSlug },
          status: "HOLD",
        },
      },
      data: { escalated_at: input.now, escalation_reason: input.reason },
    });
    if (changed.count !== 1) return false;
    await logAudit(tx, {
      entityType: "BookingPayment",
      entityId: String(input.paymentId),
      action: "ESCALATED",
      actorId: input.actorUserId,
      businessId: input.businessId,
      changes: {
        before: { escalated: false },
        after: { escalated: true, reason: input.reason },
      },
    });
    return true;
  });
}

export async function resolveGcashFollowUp(input: {
  paymentId: number;
  businessSlug: string;
  businessId: string;
  actorUserId: string;
  outcome: GcashResolutionOutcome;
  note: string | null;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.bookingPayment.updateMany({
      where: {
        id: input.paymentId,
        follow_up_required_at: { not: null },
        resolution_resolved_at: null,
        booking: {
          business_id: input.businessId,
          business: { slug: input.businessSlug },
        },
      },
      data: {
        resolution_resolved_at: input.now,
        resolution_outcome: input.outcome,
        resolution_note: input.note,
        verified_by_user_id: input.actorUserId,
      },
    });
    if (changed.count !== 1) return false;
    await logAudit(tx, {
      entityType: "BookingPayment",
      entityId: String(input.paymentId),
      action: "FOLLOW_UP_RESOLVED",
      actorId: input.actorUserId,
      businessId: input.businessId,
      changes: {
        before: { resolved: false },
        after: { resolved: true, outcome: input.outcome, note: input.note },
      },
    });
    return true;
  });
}
