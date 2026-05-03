/**
 * Pure helpers for in-place booking modifications (Phase 2 of the
 * booking-editor work). I/O-free so they can be unit-tested without
 * mocking Prisma. The server actions in
 * lib/server actions/booking-modify.ts compose these inside a
 * transaction.
 *
 * Companion docs: docs/booking-editor-design.md, docs/role-permissions-matrix.md.
 */

import {
  AvailedServiceStatus,
  BookingStatus,
  PaymentStatus,
} from "@/prisma/generated/prisma/enums";

/**
 * Reasons a service line can't safely be removed in-place. Surfaced to
 * the action so it can return a typed error instead of throwing a
 * generic "Forbidden" string. The action layer maps these to user-
 * facing copy.
 */
export type RemovableServiceRejection =
  | "BOOKING_NOT_FOUND"
  | "AVAILED_SERVICE_NOT_FOUND"
  | "AVAILED_SERVICE_BELONGS_TO_OTHER_BOOKING"
  | "BOOKING_NOT_ACCEPTED"
  | "BOOKING_HAS_PAYMENT"
  | "AVAILED_SERVICE_ALREADY_STARTED"
  | "LAST_REMAINING_SERVICE";

export type RemovableServiceCheckInput = {
  bookingId: number;
  booking: {
    id: number;
    status: BookingStatus;
    amount_paid: number;
    payment_status: PaymentStatus;
    availed_services: ReadonlyArray<{
      id: number;
      status: AvailedServiceStatus;
    }>;
  } | null;
  availedServiceId: number;
};

export type RemovableServiceCheckResult =
  | { ok: true }
  | { ok: false; reason: RemovableServiceRejection };

/**
 * Decide whether a specific AvailedService line can be removed in-place
 * from its booking. Removal is only safe when:
 *   - The booking is ACCEPTED and not yet paid (zero amount_paid, status UNPAID).
 *   - The line itself is still PENDING (hasn't been claimed/served).
 *   - At least one other line will remain on the booking after removal.
 *
 * Anything else routes the user to alternate flows (refund + remove for
 * paid bookings; cancel-the-booking for the last-line case).
 */
export function checkAvailedServiceRemovable(
  input: RemovableServiceCheckInput,
): RemovableServiceCheckResult {
  if (!input.booking) {
    return { ok: false, reason: "BOOKING_NOT_FOUND" };
  }

  const line = input.booking.availed_services.find(
    (s) => s.id === input.availedServiceId,
  );
  if (!line) {
    // The line could exist but belong to a different booking. We can't
    // tell from this input alone — that's the caller's job. Default to
    // the more conservative reason here.
    return { ok: false, reason: "AVAILED_SERVICE_NOT_FOUND" };
  }

  if (input.booking.status !== BookingStatus.ACCEPTED) {
    return { ok: false, reason: "BOOKING_NOT_ACCEPTED" };
  }

  const hasPayment =
    roundMoney(input.booking.amount_paid) > 0 ||
    input.booking.payment_status !== PaymentStatus.UNPAID;
  if (hasPayment) {
    return { ok: false, reason: "BOOKING_HAS_PAYMENT" };
  }

  if (line.status !== AvailedServiceStatus.PENDING) {
    return { ok: false, reason: "AVAILED_SERVICE_ALREADY_STARTED" };
  }

  if (input.booking.availed_services.length <= 1) {
    return { ok: false, reason: "LAST_REMAINING_SERVICE" };
  }

  return { ok: true };
}

/**
 * Recompute booking-level totals after a single line removal. Pure
 * function — operates on the line objects passed in.
 *
 * The semantics:
 *   - grand_total drops by the removed line's final_price.
 *   - total_discount drops by the removed line's discount.
 *   - amount_paid is preserved (caller has already verified it's zero).
 *
 * Numbers are rounded to two decimals to match how the rest of the
 * billing code handles money.
 */
export function recomputeTotalsAfterRemoval(input: {
  currentGrandTotal: number;
  currentTotalDiscount: number;
  removedLine: {
    final_price: number;
    discount: number;
  };
}) {
  const newGrandTotal = roundMoney(
    input.currentGrandTotal - input.removedLine.final_price,
  );
  const newTotalDiscount = roundMoney(
    input.currentTotalDiscount - input.removedLine.discount,
  );

  // Defensive clamp. If somehow the math goes negative (data drift /
  // legacy rows), treat it as zero rather than letting a negative
  // total leak into the audit trail or notifications.
  return {
    grandTotal: Math.max(0, newGrandTotal),
    totalDiscount: Math.max(0, newTotalDiscount),
  };
}

/**
 * Map a {@link RemovableServiceRejection} to a user-facing copy string.
 * Centralized so the server action and any future UI components stay
 * consistent.
 */
export function rejectionMessage(reason: RemovableServiceRejection): string {
  switch (reason) {
    case "BOOKING_NOT_FOUND":
      return "Booking not found.";
    case "AVAILED_SERVICE_NOT_FOUND":
      return "That service line is no longer on this booking.";
    case "AVAILED_SERVICE_BELONGS_TO_OTHER_BOOKING":
      return "That service line belongs to a different booking.";
    case "BOOKING_NOT_ACCEPTED":
      return "This booking is no longer in an editable state.";
    case "BOOKING_HAS_PAYMENT":
      return "This booking already has a payment recorded — issue a refund first.";
    case "AVAILED_SERVICE_ALREADY_STARTED":
      return "This service has already started or finished — it can't be removed.";
    case "LAST_REMAINING_SERVICE":
      return "Cancel the booking instead — this is the only service left on it.";
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
