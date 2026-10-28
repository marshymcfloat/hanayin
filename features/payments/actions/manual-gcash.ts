"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import {
  approveGcashPaymentSchema,
  escalateGcashPaymentSchema,
  gcashBusinessSlugSchema,
  rejectGcashPaymentSchema,
  resolveGcashFollowUpSchema,
  submitGcashPaymentSchema,
} from "@/features/payments/manual-gcash-schemas";
import { getGcashVerificationQueue } from "@/features/payments/queries/manual-gcash";
import {
  approveGcashPayment,
  escalateGcashPayment,
  rejectGcashPayment,
  resolveGcashFollowUp,
  submitGcashPayment,
} from "@/features/payments/services/manual-gcash";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { BookingAvailabilityError } from "@/features/bookings/services/booking-availability";
import { deliverOutboxMessageNow } from "@/lib/services/outbox-immediate";
import { verifyBookingSuccessToken } from "@/lib/security/booking-success-token";
import type { GcashResolutionOutcome } from "@/lib/types/manual-gcash";

const REVIEW_WINDOW_MS = 4 * 60 * 60 * 1000;

function refreshBookingDashboards(businessSlug: string) {
  try {
    revalidatePath(`/app/${businessSlug}`);
    revalidatePath(`/app/${businessSlug}/bookings`);
  } catch (error) {
    console.error("GCash dashboard revalidation failed:", error);
  }
}

async function requireVerifier(businessSlug: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false as const, error: "Unauthorized" };
  }
  const actor = await resolveTenantActorContext(businessSlug, session.user.id);
  if (!actor.success) return actor;
  if (actor.actorType !== "OWNER") {
    return { success: false as const, error: "Forbidden" };
  }
  return { success: true as const, actor, userId: session.user.id };
}

export async function submitGcashPaymentAction(rawInput: {
  bookingId: number;
  businessSlug: string;
  token: string;
  payerName?: string;
  reference?: string;
}) {
  const parsed = submitGcashPaymentSchema.safeParse(rawInput);
  if (
    !parsed.success ||
    !verifyBookingSuccessToken({
      token: parsed.data.token,
      bookingId: parsed.data.bookingId,
      businessSlug: parsed.data.businessSlug,
      purpose: "success",
    })
  ) {
    return { success: false as const, error: "Invalid booking link." };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + REVIEW_WINDOW_MS);
  try {
    const result = await submitGcashPayment({
      bookingId: parsed.data.bookingId,
      businessSlug: parsed.data.businessSlug,
      payerName: parsed.data.payerName,
      reference: parsed.data.reference,
      now,
      expiresAt,
    });
    return { success: true as const, ...result, expiresAt };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error && error.message === "HOLD_EXPIRED"
          ? "This payment window has expired."
          : "Unable to submit payment for verification.",
    };
  }
}

export async function getGcashVerificationQueueAction(businessSlug: string) {
  const parsed = gcashBusinessSlugSchema.safeParse(businessSlug);
  if (!parsed.success) {
    return { success: false as const, error: "Unauthorized" };
  }
  const auth = await requireVerifier(parsed.data);
  if (!auth.success) return auth;
  try {
    const result = await getGcashVerificationQueue({
      businessId: auth.actor.businessId,
    });
    return { success: true as const, ...result };
  } catch (error) {
    if (error instanceof Error && error.message === "GCASH_NOT_CONFIGURED") {
      return {
        success: false as const,
        error: "GCash account is not configured.",
      };
    }
    console.error("GCash verification queue failed:", error);
    return {
      success: false as const,
      error: "Unable to load GCash verification queue.",
    };
  }
}

export async function approveGcashPaymentAction(rawInput: {
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
  const parsed = approveGcashPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      error: "Complete every verification check before confirming.",
    };
  }
  const auth = await requireVerifier(parsed.data.businessSlug);
  if (!auth.success) return auth;
  try {
    const outboxMessageId = await approveGcashPayment({
      ...parsed.data,
      businessId: auth.actor.businessId,
      actorUserId: auth.userId,
      now: new Date(),
    });
    try {
      await deliverOutboxMessageNow(outboxMessageId);
    } catch (error) {
      console.error("GCash confirmation delivery failed:", error);
    }
    refreshBookingDashboards(parsed.data.businessSlug);
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
    if (!(error instanceof Error && error.message === "NOT_REVIEWABLE")) {
      console.error("GCash payment approval failed:", error);
    }
    return {
      success: false as const,
      error: "Payment is no longer available for approval.",
    };
  }
}

export async function rejectGcashPaymentAction(rawInput: {
  paymentId: number;
  businessSlug: string;
  reason: string;
  internalNote?: string;
}) {
  const parsed = rejectGcashPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      error: "Select a valid rejection reason.",
    };
  }
  const auth = await requireVerifier(parsed.data.businessSlug);
  if (!auth.success) return auth;
  try {
    await rejectGcashPayment({
      paymentId: parsed.data.paymentId,
      businessSlug: parsed.data.businessSlug,
      businessId: auth.actor.businessId,
      actorUserId: auth.userId,
      rejectionReason: parsed.data.reason,
      internalNote: parsed.data.internalNote,
      now: new Date(),
    });
    refreshBookingDashboards(parsed.data.businessSlug);
    return { success: true as const };
  } catch {
    return {
      success: false as const,
      error: "Payment is no longer available for rejection.",
    };
  }
}

export async function escalateGcashPaymentAction(rawInput: {
  paymentId: number;
  businessSlug: string;
  reason: string;
}) {
  const parsed = escalateGcashPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      error: "An escalation reason is required.",
    };
  }
  const auth = await requireVerifier(parsed.data.businessSlug);
  if (!auth.success) return auth;
  const updated = await escalateGcashPayment({
    ...parsed.data,
    businessId: auth.actor.businessId,
    actorUserId: auth.userId,
    now: new Date(),
  });
  if (!updated) {
    return {
      success: false as const,
      error: "Payment is no longer available for escalation.",
    };
  }
  refreshBookingDashboards(parsed.data.businessSlug);
  return { success: true as const };
}

export async function resolveGcashFollowUpAction(rawInput: {
  paymentId: number;
  businessSlug: string;
  outcome: GcashResolutionOutcome;
  note?: string;
}) {
  const parsed = resolveGcashFollowUpSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      error: "Select a valid resolution outcome.",
    };
  }
  const auth = await requireVerifier(parsed.data.businessSlug);
  if (!auth.success) return auth;
  const updated = await resolveGcashFollowUp({
    ...parsed.data,
    businessId: auth.actor.businessId,
    actorUserId: auth.userId,
    now: new Date(),
  });
  if (!updated) {
    return {
      success: false as const,
      error: "Follow-up was already resolved or is unavailable.",
    };
  }
  refreshBookingDashboards(parsed.data.businessSlug);
  return { success: true as const };
}
