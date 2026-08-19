"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { prisma } from "@/prisma/prisma";
import { authOptions } from "@/lib/next auth/options";
import { verifyBookingSuccessToken } from "@/lib/security/booking-success-token";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { Prisma } from "@/prisma/generated/prisma/client";
import { publishEvent } from "@/lib/services/outbox";
import { deliverOutboxMessageNow } from "@/lib/services/outbox-immediate";
import { logAudit } from "@/lib/services/audit";
import {
  BookingAvailabilityError,
  validateBookingOrThrow,
} from "@/lib/services/booking-availability";
import {
  GCASH_REJECTION_REASONS,
  GCASH_RESOLUTION_OUTCOMES,
  type GcashFollowUpItem,
  type GcashResolutionOutcome,
  type GcashVerificationItem,
} from "@/lib/types/manual-gcash";

const REVIEW_WINDOW_MS = 4 * 60 * 60 * 1000;
const DEPOSIT_PERCENTAGE = 20;

const cleanOptional = (value?: string, max = 100) => {
  const cleaned = value?.trim().replace(/\s+/g, " ").slice(0, max);
  return cleaned || null;
};

function refreshBookingDashboards(businessSlug: string) {
  try {
    revalidatePath(`/app/${businessSlug}`);
    revalidatePath(`/app/${businessSlug}/bookings`);
  } catch (error) {
    console.error("GCash dashboard revalidation failed:", error);
  }
}

export async function submitGcashPaymentAction(input: {
  bookingId: number;
  businessSlug: string;
  token: string;
  payerName?: string;
  reference?: string;
}) {
  if (
    !Number.isInteger(input.bookingId) ||
    !verifyBookingSuccessToken({
      token: input.token,
      bookingId: input.bookingId,
      businessSlug: input.businessSlug,
      purpose: "success",
    })
  )
    return { success: false as const, error: "Invalid booking link." };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + REVIEW_WINDOW_MS);
  const payerName = cleanOptional(input.payerName);
  const reference = cleanOptional(input.reference, 80)?.toUpperCase() ?? null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.bookingPayment.findFirst({
        where: { booking_id: input.bookingId, status: "PENDING" },
        include: { booking: { include: { business: true } } },
        orderBy: { created_at: "desc" },
      });
      if (!payment || payment.booking.business.slug !== input.businessSlug)
        throw new Error("PAYMENT_NOT_FOUND");
      if (payment.submitted_at)
        return { duplicateReference: false, idempotent: true };
      if (
        payment.booking.status !== "HOLD" ||
        !payment.expires_at ||
        payment.expires_at <= now
      )
        throw new Error("HOLD_EXPIRED");

      const duplicateReference = reference
        ? (await tx.bookingPayment.count({
            where: {
              id: { not: payment.id },
              provider_reference: reference,
              booking: { business_id: payment.booking.business_id },
            },
          })) > 0
        : false;

      const updated = await tx.bookingPayment.updateMany({
        where: { id: payment.id, status: "PENDING", submitted_at: null },
        data: {
          payer_name: payerName,
          provider_reference: reference,
          submitted_at: now,
          expires_at: expiresAt,
        },
      });
      if (updated.count === 0) return { duplicateReference, idempotent: true };
      await tx.booking.update({
        where: { id: input.bookingId },
        data: { hold_expires_at: expiresAt },
      });
      return { duplicateReference, idempotent: false };
    });
    return { success: true as const, ...result, expiresAt };
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return {
      success: false as const,
      error:
        code === "HOLD_EXPIRED"
          ? "This payment window has expired."
          : "Unable to submit payment for verification.",
    };
  }
}

async function requireVerifier(businessSlug: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return { success: false as const, error: "Unauthorized" };
  const actor = await resolveTenantActorContext(businessSlug, session.user.id);
  if (!actor.success) return actor;
  if (actor.actorType !== "OWNER")
    return { success: false as const, error: "Forbidden" };
  return { success: true as const, actor, userId: session.user.id };
}

export async function getGcashVerificationQueueAction(businessSlug: string) {
  const auth = await requireVerifier(businessSlug);
  if (!auth.success) return auth;
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true, gcash_account_name: true, gcash_mobile_number: true },
  });
  if (!business?.gcash_account_name || !business.gcash_mobile_number) {
    return {
      success: false as const,
      error: "GCash account is not configured.",
    };
  }

  const [payments, followUps] = await Promise.all([
    prisma.bookingPayment.findMany({
      where: {
        status: "PENDING",
        submitted_at: { not: null },
        booking: { business_id: business.id, status: "HOLD" },
      },
      include: {
        booking: {
          include: {
            customer: { select: { name: true, phone: true } },
            availed_services: {
              include: { service: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { submitted_at: "asc" },
    }),
    prisma.bookingPayment.findMany({
      where: {
        follow_up_required_at: { not: null },
        resolution_resolved_at: null,
        booking: { business_id: business.id },
      },
      include: {
        booking: {
          include: { customer: { select: { name: true, phone: true } } },
        },
      },
      orderBy: { follow_up_required_at: "asc" },
    }),
  ]);

  const verificationItems: GcashVerificationItem[] = payments.flatMap(
    (payment) => {
      if (!payment.submitted_at || !payment.expires_at) return [];
      return [
        {
          id: payment.id,
          stage: payment.escalated_at
            ? "NEEDS_RESOLUTION"
            : "AWAITING_VERIFICATION",
          amountPrincipal: payment.amount_principal,
          payerName: payment.payer_name,
          providerReference: payment.provider_reference,
          submittedAt: payment.submitted_at,
          expiresAt: payment.expires_at,
          escalatedAt: payment.escalated_at,
          escalationReason: payment.escalation_reason,
          destination: {
            accountName: business.gcash_account_name!,
            mobileNumber: business.gcash_mobile_number!,
          },
          booking: {
            id: payment.booking.id,
            scheduledAt: payment.booking.scheduled_at,
            customerName:
              payment.booking.customer?.name ??
              payment.booking.customer_label ??
              "Customer",
            customerPhone: payment.booking.customer?.phone ?? null,
            services: payment.booking.availed_services.map(
              (item) => item.service.name,
            ),
          },
        },
      ];
    },
  );

  const followUpItems: GcashFollowUpItem[] = followUps.flatMap((payment) => {
    if (!payment.follow_up_required_at) return [];
    return [
      {
        id: payment.id,
        amountPrincipal: payment.amount_principal,
        payerName: payment.payer_name,
        providerReference: payment.provider_reference,
        submittedAt: payment.submitted_at,
        followUpRequiredAt: payment.follow_up_required_at,
        escalationReason: payment.escalation_reason,
        booking: {
          id: payment.booking.id,
          scheduledAt: payment.booking.scheduled_at,
          customerName:
            payment.booking.customer?.name ??
            payment.booking.customer_label ??
            "Customer",
          customerPhone: payment.booking.customer?.phone ?? null,
        },
      },
    ];
  });

  return { success: true as const, verificationItems, followUpItems };
}

export async function approveGcashPaymentAction(input: {
  paymentId: number;
  businessSlug: string;
  source: "CUSTOMER_SUBMITTED" | "OWNER_VERIFIED_WITHOUT_SUBMISSION";
  attestation: {
    transactionFound: boolean;
    recipientMatched: boolean;
    amountMatched: boolean;
    detailsReviewed: boolean;
  };
}) {
  const { paymentId, businessSlug, attestation, source } = input;
  const auth = await requireVerifier(businessSlug);
  if (!auth.success) return auth;
  if (
    !Number.isInteger(paymentId) ||
    !["CUSTOMER_SUBMITTED", "OWNER_VERIFIED_WITHOUT_SUBMISSION"].includes(
      source,
    ) ||
    !Object.values(attestation).every(Boolean)
  ) {
    return {
      success: false as const,
      error: "Complete every verification check before confirming.",
    };
  }
  const now = new Date();
  try {
    const outboxMessageId = await prisma.$transaction(
      async (tx) => {
        const payment = await tx.bookingPayment.findFirst({
          where: {
            id: paymentId,
            status: "PENDING",
            submitted_at:
              source === "CUSTOMER_SUBMITTED" ? { not: null } : null,
            booking: { business: { slug: businessSlug }, status: "HOLD" },
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
        if (!payment || !payment.expires_at || payment.expires_at <= now)
          throw new Error("NOT_REVIEWABLE");
        const expectedDeposit =
          Math.round(payment.booking.grand_total * DEPOSIT_PERCENTAGE) / 100;
        if (Math.abs(payment.amount_principal - expectedDeposit) > 0.009) {
          throw new Error("AMOUNT_CHANGED");
        }

        const locked = await tx.booking.updateMany({
          where: {
            id: payment.booking_id,
            status: "HOLD",
            hold_expires_at: { gt: now },
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
          businessSlug,
          scheduledAt: payment.booking.scheduled_at,
          services: Array.from(serviceCounts, ([id, quantity]) => ({
            id,
            quantity,
          })),
          paymentType: "DOWNPAYMENT",
          isPublicBooking: true,
          selectedEmployeeId:
            assignedEmployeeIds.length === 1
              ? assignedEmployeeIds[0]
              : undefined,
          staffSelectionMode:
            assignedEmployeeIds.length === 1
              ? "REQUIRE_SELECTED"
              : "ANY_AVAILABLE",
          now: payment.booking.created_at,
          db: tx,
        });

        const changed = await tx.bookingPayment.updateMany({
          where: { id: payment.id, status: "PENDING", verified_at: null },
          data: {
            status: "SUCCEEDED",
            paid_at: now,
            verified_at: now,
            verified_by_user_id: auth.userId,
          },
        });
        if (changed.count !== 1) throw new Error("NOT_REVIEWABLE");
        const accepted = await tx.booking.updateMany({
          where: { id: payment.booking_id, status: "CANCELLED" },
          data: {
            status: "ACCEPTED",
            payment_status: "PARTIALLY_PAID",
            amount_paid: payment.amount_principal,
            downpayment: payment.amount_principal,
            downpayment_date: now,
            hold_expires_at: null,
          },
        });
        if (accepted.count !== 1) throw new Error("NOT_REVIEWABLE");
        await logAudit(tx, {
          entityType: "BookingPayment",
          entityId: String(payment.id),
          action: "APPROVED",
          actorId: auth.userId,
          businessId: payment.booking.business_id,
          changes: {
            before: { status: "PENDING" },
            after: { status: "SUCCEEDED", attestation, source },
          },
        });
        const confirmationEvent = await publishEvent(
          tx as Prisma.TransactionClient,
          {
            type: "BOOKING_CONFIRMED",
            aggregateType: "Booking",
            aggregateId: String(payment.booking_id),
            businessId: payment.booking.business_id,
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
    await deliverOutboxMessageNow(outboxMessageId);
    refreshBookingDashboards(businessSlug);
    return { success: true as const };
  } catch (error) {
    if (
      error instanceof BookingAvailabilityError ||
      (error instanceof Error && error.message === "SLOT_INVALID")
    ) {
      return {
        success: false as const,
        error:
          "The appointment slot or assigned staff is no longer available. Escalate or reject this payment.",
      };
    }
    if (error instanceof Error && error.message === "AMOUNT_CHANGED") {
      return {
        success: false as const,
        error: "The expected deposit no longer matches this booking.",
      };
    }
    if (error instanceof Error && error.message === "NOT_REVIEWABLE") {
      return {
        success: false as const,
        error: "Payment is no longer available for approval.",
      };
    }
    console.error("GCash payment approval failed:", error);
    return {
      success: false as const,
      error: "Payment is no longer available for approval.",
    };
  }
}

export async function rejectGcashPaymentAction(input: {
  paymentId: number;
  businessSlug: string;
  reason: string;
  internalNote?: string;
}) {
  const { paymentId, businessSlug } = input;
  const auth = await requireVerifier(businessSlug);
  if (!auth.success) return auth;
  const rejectionReason = cleanOptional(input.reason, 80);
  const internalNote = cleanOptional(input.internalNote, 500);
  if (
    !rejectionReason ||
    !GCASH_REJECTION_REASONS.includes(
      rejectionReason as (typeof GCASH_REJECTION_REASONS)[number],
    )
  )
    return {
      success: false as const,
      error: "Select a valid rejection reason.",
    };
  const now = new Date();
  try {
    await prisma.$transaction(
      async (tx) => {
        const payment = await tx.bookingPayment.findFirst({
          where: {
            id: paymentId,
            status: "PENDING",
            submitted_at: { not: null },
            booking: { business: { slug: businessSlug }, status: "HOLD" },
          },
          include: { booking: { include: { customer: true } } },
        });
        if (!payment) throw new Error("NOT_REVIEWABLE");
        const cancelled = await tx.booking.updateMany({
          where: { id: payment.booking_id, status: "HOLD" },
          data: {
            status: "CANCELLED",
            cancelled_at: now,
            cancelled_by_id: auth.userId,
            cancellation_reason: rejectionReason,
            hold_expires_at: null,
          },
        });
        if (cancelled.count !== 1) throw new Error("NOT_REVIEWABLE");
        const changed = await tx.bookingPayment.updateMany({
          where: { id: payment.id, status: "PENDING", verified_at: null },
          data: {
            status: "FAILED",
            verified_at: now,
            verified_by_user_id: auth.userId,
            rejection_reason: rejectionReason,
            resolution_note: internalNote,
            resolution_resolved_at: now,
            resolution_outcome: "NO_PAYMENT_FOUND",
          },
        });
        if (changed.count !== 1) throw new Error("NOT_REVIEWABLE");
        await tx.availedService.updateMany({
          where: {
            booking_id: payment.booking_id,
            status: { not: "COMPLETED" },
          },
          data: { status: "CANCELLED", cancelled_at: now },
        });
        await tx.voucher.updateMany({
          where: { used_by_id: payment.booking_id },
          data: { used_by_id: null, is_active: true },
        });
        await logAudit(tx, {
          entityType: "BookingPayment",
          entityId: String(payment.id),
          action: "REJECTED",
          actorId: auth.userId,
          businessId: payment.booking.business_id,
          changes: {
            before: { status: "PENDING" },
            after: { status: "FAILED", reason: rejectionReason, internalNote },
          },
        });
        await publishEvent(tx as Prisma.TransactionClient, {
          type: "BOOKING_CANCELLED",
          aggregateType: "Booking",
          aggregateId: String(payment.booking_id),
          businessId: payment.booking.business_id,
          payload: {
            bookingId: payment.booking_id,
            reason: rejectionReason,
            status: "CANCELLED",
            email: payment.booking.customer?.email,
            phone: payment.booking.customer?.phone,
            customerName: payment.booking.customer?.name,
            actorUserId: auth.userId,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    refreshBookingDashboards(businessSlug);
    return { success: true as const };
  } catch {
    return {
      success: false as const,
      error: "Payment is no longer available for rejection.",
    };
  }
}

export async function escalateGcashPaymentAction(input: {
  paymentId: number;
  businessSlug: string;
  reason: string;
}) {
  const auth = await requireVerifier(input.businessSlug);
  if (!auth.success) return auth;
  const reason = cleanOptional(input.reason, 240);
  if (!Number.isInteger(input.paymentId) || !reason)
    return {
      success: false as const,
      error: "An escalation reason is required.",
    };
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.bookingPayment.updateMany({
      where: {
        id: input.paymentId,
        status: "PENDING",
        submitted_at: { not: null },
        escalated_at: null,
        expires_at: { gt: now },
        booking: { business: { slug: input.businessSlug }, status: "HOLD" },
      },
      data: { escalated_at: now, escalation_reason: reason },
    });
    if (changed.count !== 1) return false;
    await logAudit(tx, {
      entityType: "BookingPayment",
      entityId: String(input.paymentId),
      action: "ESCALATED",
      actorId: auth.userId,
      businessId: auth.actor.businessId,
      changes: {
        before: { escalated: false },
        after: { escalated: true, reason },
      },
    });
    return true;
  });
  if (!updated)
    return {
      success: false as const,
      error: "Payment is no longer available for escalation.",
    };
  refreshBookingDashboards(input.businessSlug);
  return { success: true as const };
}

export async function resolveGcashFollowUpAction(input: {
  paymentId: number;
  businessSlug: string;
  outcome: GcashResolutionOutcome;
  note?: string;
}) {
  const auth = await requireVerifier(input.businessSlug);
  if (!auth.success) return auth;
  if (
    !Number.isInteger(input.paymentId) ||
    !GCASH_RESOLUTION_OUTCOMES.includes(input.outcome)
  )
    return {
      success: false as const,
      error: "Select a valid resolution outcome.",
    };
  const note = cleanOptional(input.note, 500);
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.bookingPayment.updateMany({
      where: {
        id: input.paymentId,
        follow_up_required_at: { not: null },
        resolution_resolved_at: null,
        booking: { business: { slug: input.businessSlug } },
      },
      data: {
        resolution_resolved_at: now,
        resolution_outcome: input.outcome,
        resolution_note: note,
        verified_by_user_id: auth.userId,
      },
    });
    if (changed.count !== 1) return false;
    await logAudit(tx, {
      entityType: "BookingPayment",
      entityId: String(input.paymentId),
      action: "FOLLOW_UP_RESOLVED",
      actorId: auth.userId,
      businessId: auth.actor.businessId,
      changes: {
        before: { resolved: false },
        after: { resolved: true, outcome: input.outcome, note },
      },
    });
    return true;
  });
  if (!updated)
    return {
      success: false as const,
      error: "Follow-up was already resolved or is unavailable.",
    };
  refreshBookingDashboards(input.businessSlug);
  return { success: true as const };
}
