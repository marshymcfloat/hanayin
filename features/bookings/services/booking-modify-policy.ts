/**
 * Pure helpers for in-place booking modifications (Phase 2 of the
 * booking-editor work). I/O-free so they can be unit-tested without
 * mocking Prisma. The server actions in
 * features/bookings/services/booking-modify.ts composes these inside a
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

// ─── Reschedule helpers ────────────────────────────────────────────

export type RescheduleRejection =
  | "BOOKING_NOT_FOUND"
  | "BOOKING_NOT_ACCEPTED"
  | "BOOKING_HAS_NO_SCHEDULED_TIME"
  | "BOOKING_HAS_STARTED_SERVICE"
  | "BOOKING_ALREADY_AT_TIME"
  | "NEW_TIME_IN_PAST";

export type RescheduleCheckInput = {
  booking: {
    id: number;
    status: BookingStatus;
    scheduled_at: Date | null;
    availed_services: ReadonlyArray<{ status: AvailedServiceStatus }>;
  } | null;
  newScheduledAt: Date;
  /** Defaults to "now" — pass a deterministic clock for tests. */
  now?: Date;
};

export type RescheduleCheckResult =
  | { ok: true }
  | { ok: false; reason: RescheduleRejection };

/**
 * Decide whether a booking can safely be moved to a new scheduled
 * time. Reschedule is only valid when:
 *   - The booking is ACCEPTED.
 *   - It already has a scheduled_at (we're moving an existing
 *     appointment, not pinning a walk-in).
 *   - No service has started or finished (no SERVING / COMPLETED).
 *   - The new time is different from the current one.
 *   - The new time is in the future (or now). We deliberately don't
 *     guard against rescheduling to the very near past; an owner
 *     correcting a back-dated booking is a legitimate use case.
 */
export function checkBookingReschedulable(
  input: RescheduleCheckInput,
): RescheduleCheckResult {
  if (!input.booking) {
    return { ok: false, reason: "BOOKING_NOT_FOUND" };
  }
  if (input.booking.status !== BookingStatus.ACCEPTED) {
    return { ok: false, reason: "BOOKING_NOT_ACCEPTED" };
  }
  if (!input.booking.scheduled_at) {
    return { ok: false, reason: "BOOKING_HAS_NO_SCHEDULED_TIME" };
  }
  const hasStarted = input.booking.availed_services.some(
    (s) =>
      s.status === AvailedServiceStatus.SERVING ||
      s.status === AvailedServiceStatus.COMPLETED,
  );
  if (hasStarted) {
    return { ok: false, reason: "BOOKING_HAS_STARTED_SERVICE" };
  }
  if (
    input.booking.scheduled_at.getTime() === input.newScheduledAt.getTime()
  ) {
    return { ok: false, reason: "BOOKING_ALREADY_AT_TIME" };
  }
  const nowMs = (input.now ?? new Date()).getTime();
  if (input.newScheduledAt.getTime() < nowMs) {
    return { ok: false, reason: "NEW_TIME_IN_PAST" };
  }
  return { ok: true };
}

/**
 * Compute the deltas needed to reschedule a booking. Pure function —
 * given the current scheduled_at + estimated_end + service line
 * timestamps + a new scheduled_at, returns the new estimated_end and
 * the per-line shifted timestamps.
 *
 * Strategy: shift everything by the same delta so relative gaps
 * between services are preserved. If the booking was at 2pm with
 * services at 2:00 / 2:30 / 3:00 and we move it to 4pm, services
 * become 4:00 / 4:30 / 5:00. No re-pricing, no duration lookup.
 */
export function applyRescheduleShift(input: {
  oldScheduledAt: Date;
  newScheduledAt: Date;
  oldEstimatedEnd: Date | null;
  lines: ReadonlyArray<{
    id: number;
    scheduled_at: Date | null;
    estimated_end: Date | null;
  }>;
}) {
  const deltaMs =
    input.newScheduledAt.getTime() - input.oldScheduledAt.getTime();

  const newEstimatedEnd = input.oldEstimatedEnd
    ? new Date(input.oldEstimatedEnd.getTime() + deltaMs)
    : null;

  const shiftedLines = input.lines.map((line) => ({
    id: line.id,
    scheduled_at: line.scheduled_at
      ? new Date(line.scheduled_at.getTime() + deltaMs)
      : null,
    estimated_end: line.estimated_end
      ? new Date(line.estimated_end.getTime() + deltaMs)
      : null,
  }));

  return {
    deltaMs,
    newEstimatedEnd,
    shiftedLines,
  };
}

/**
 * User-facing copy for reschedule rejections.
 */
export function rescheduleRejectionMessage(reason: RescheduleRejection): string {
  switch (reason) {
    case "BOOKING_NOT_FOUND":
      return "Booking not found.";
    case "BOOKING_NOT_ACCEPTED":
      return "This booking is no longer in an editable state.";
    case "BOOKING_HAS_NO_SCHEDULED_TIME":
      return "This booking doesn't have a scheduled time yet — reschedule isn't applicable.";
    case "BOOKING_HAS_STARTED_SERVICE":
      return "A service has already started on this booking — it can't be rescheduled.";
    case "BOOKING_ALREADY_AT_TIME":
      return "This booking is already at the requested time.";
    case "NEW_TIME_IN_PAST":
      return "Pick a time in the future.";
  }
}

// ─── Staff reassignment helpers ───────────────────────────────────

export type ReassignRejection =
  | "AVAILED_SERVICE_NOT_FOUND"
  | "AVAILED_SERVICE_ALREADY_STARTED"
  | "AVAILED_SERVICE_CANCELLED"
  | "EMPLOYEE_NOT_FOUND"
  | "ALREADY_ASSIGNED_TO_EMPLOYEE";

export type ReassignCheckInput = {
  availedService: {
    id: number;
    status: AvailedServiceStatus;
    served_by_id: number | null;
  } | null;
  /** The employee the caller wants to assign this line to. */
  newEmployeeId: number;
};

export type ReassignCheckResult =
  | { ok: true }
  | { ok: false; reason: ReassignRejection };

/**
 * Decide whether a staff reassignment is safe. Allowed when the line
 * is PENDING or CLAIMED — once SERVING or COMPLETED the staffing is
 * settled. CANCELLED lines are explicitly rejected with their own
 * reason since reassigning a cancelled service makes no sense.
 *
 * Employee membership in the actor's business is verified by the
 * action layer (Prisma query); the helper just checks state semantics.
 */
export function checkAvailedServiceReassignable(
  input: ReassignCheckInput,
): ReassignCheckResult {
  if (!input.availedService) {
    return { ok: false, reason: "AVAILED_SERVICE_NOT_FOUND" };
  }
  if (input.availedService.status === AvailedServiceStatus.CANCELLED) {
    return { ok: false, reason: "AVAILED_SERVICE_CANCELLED" };
  }
  if (
    input.availedService.status === AvailedServiceStatus.SERVING ||
    input.availedService.status === AvailedServiceStatus.COMPLETED
  ) {
    return { ok: false, reason: "AVAILED_SERVICE_ALREADY_STARTED" };
  }
  if (input.availedService.served_by_id === input.newEmployeeId) {
    return { ok: false, reason: "ALREADY_ASSIGNED_TO_EMPLOYEE" };
  }
  return { ok: true };
}

/**
 * User-facing copy for reassignment rejections.
 */
export function reassignRejectionMessage(reason: ReassignRejection): string {
  switch (reason) {
    case "AVAILED_SERVICE_NOT_FOUND":
      return "That service line is no longer on this booking.";
    case "AVAILED_SERVICE_ALREADY_STARTED":
      return "This service has already started or finished — staffing can't be changed.";
    case "AVAILED_SERVICE_CANCELLED":
      return "This service was cancelled and can't be reassigned.";
    case "EMPLOYEE_NOT_FOUND":
      return "That employee is not part of this business.";
    case "ALREADY_ASSIGNED_TO_EMPLOYEE":
      return "This service is already assigned to that employee.";
  }
}

// ─── Price-adjust helpers ───────────────────────────────────────

export type PriceAdjustRejection =
  | "BOOKING_NOT_FOUND"
  | "BOOKING_NOT_ACCEPTED"
  | "BOOKING_FULLY_PAID"
  | "AVAILED_SERVICE_NOT_FOUND"
  | "AVAILED_SERVICE_BELONGS_TO_OTHER_BOOKING"
  | "DELTA_IS_ZERO"
  | "REASON_REQUIRED"
  | "RESULTING_TOTAL_NEGATIVE";

export type PriceAdjustCheckInput = {
  booking: {
    id: number;
    status: BookingStatus;
    payment_status: PaymentStatus;
    grand_total: number;
    availed_services: ReadonlyArray<{ id: number; final_price: number }>;
  } | null;
  /** Optional. When provided, the adjustment targets a specific line. */
  availedServiceId?: number;
  deltaAmount: number;
  reason: string;
};

export type PriceAdjustCheckResult =
  | { ok: true; resultingGrandTotal: number }
  | { ok: false; reason: PriceAdjustRejection };

/**
 * Decide whether a price adjustment is safe. Allowed when:
 *   - booking is ACCEPTED
 *   - booking is not fully PAID (PARTIALLY_PAID is fine — the customer
 *     might still owe more, and rebalancing is the whole point)
 *   - delta is non-zero
 *   - reason is non-empty after trimming
 *   - the resulting grand_total stays >= 0
 *   - if availedServiceId is provided, that line is on this booking
 *
 * Adjusting a fully PAID booking is intentionally rejected — refund
 * is the right tool for that, not adjust.
 */
export function checkBookingPriceAdjustable(
  input: PriceAdjustCheckInput,
): PriceAdjustCheckResult {
  if (!input.booking) {
    return { ok: false, reason: "BOOKING_NOT_FOUND" };
  }
  if (input.booking.status !== BookingStatus.ACCEPTED) {
    return { ok: false, reason: "BOOKING_NOT_ACCEPTED" };
  }
  if (input.booking.payment_status === PaymentStatus.PAID) {
    return { ok: false, reason: "BOOKING_FULLY_PAID" };
  }
  if (Math.round(input.deltaAmount * 100) === 0) {
    return { ok: false, reason: "DELTA_IS_ZERO" };
  }
  if (!input.reason || input.reason.trim().length === 0) {
    return { ok: false, reason: "REASON_REQUIRED" };
  }
  if (input.availedServiceId !== undefined) {
    const line = input.booking.availed_services.find(
      (s) => s.id === input.availedServiceId,
    );
    if (!line) {
      return { ok: false, reason: "AVAILED_SERVICE_NOT_FOUND" };
    }
  }
  const next =
    Math.round((input.booking.grand_total + input.deltaAmount) * 100) / 100;
  if (next < 0) {
    return { ok: false, reason: "RESULTING_TOTAL_NEGATIVE" };
  }
  return { ok: true, resultingGrandTotal: next };
}

/**
 * User-facing copy for price-adjust rejections.
 */
export function priceAdjustRejectionMessage(
  reason: PriceAdjustRejection,
): string {
  switch (reason) {
    case "BOOKING_NOT_FOUND":
      return "Booking not found.";
    case "BOOKING_NOT_ACCEPTED":
      return "This booking is no longer in an editable state.";
    case "BOOKING_FULLY_PAID":
      return "This booking is fully paid — issue a refund instead of an adjustment.";
    case "AVAILED_SERVICE_NOT_FOUND":
      return "That service line is no longer on this booking.";
    case "AVAILED_SERVICE_BELONGS_TO_OTHER_BOOKING":
      return "That service line belongs to a different booking.";
    case "DELTA_IS_ZERO":
      return "The adjustment amount must be non-zero.";
    case "REASON_REQUIRED":
      return "Please provide a reason for the adjustment.";
    case "RESULTING_TOTAL_NEGATIVE":
      return "That adjustment would make the booking total negative.";
  }
}

// ─── Cancel helpers ─────────────────────────────────────────────

export type CancelRejection =
  | "BOOKING_NOT_FOUND"
  | "BOOKING_ALREADY_CANCELLED"
  | "BOOKING_ALREADY_COMPLETED"
  | "REASON_REQUIRED";

export type CancelCheckInput = {
  booking: {
    id: number;
    status: BookingStatus;
  } | null;
  reason: string;
};

export type CancelCheckResult =
  | { ok: true }
  | { ok: false; reason: CancelRejection };

/**
 * Decide whether a booking can be soft-cancelled. Allowed when:
 *   - status is HOLD or ACCEPTED (not CANCELLED, not COMPLETED)
 *   - reason is non-empty after trimming
 *
 * COMPLETED bookings cannot be cancelled — services already happened
 * and the customer was already served. Those go through the refund
 * flow, not cancel. Already-CANCELLED bookings reject idempotently
 * with their own code so the UI can show "this is already cancelled"
 * instead of a generic error.
 */
export function checkBookingCancellable(
  input: CancelCheckInput,
): CancelCheckResult {
  if (!input.booking) {
    return { ok: false, reason: "BOOKING_NOT_FOUND" };
  }
  if (input.booking.status === BookingStatus.CANCELLED) {
    return { ok: false, reason: "BOOKING_ALREADY_CANCELLED" };
  }
  if (input.booking.status === BookingStatus.COMPLETED) {
    return { ok: false, reason: "BOOKING_ALREADY_COMPLETED" };
  }
  if (!input.reason || input.reason.trim().length === 0) {
    return { ok: false, reason: "REASON_REQUIRED" };
  }
  return { ok: true };
}

/**
 * User-facing copy for cancel rejections.
 */
export function cancelRejectionMessage(reason: CancelRejection): string {
  switch (reason) {
    case "BOOKING_NOT_FOUND":
      return "Booking not found.";
    case "BOOKING_ALREADY_CANCELLED":
      return "This booking is already cancelled.";
    case "BOOKING_ALREADY_COMPLETED":
      return "This booking is already completed — issue a refund instead of cancelling.";
    case "REASON_REQUIRED":
      return "Please provide a reason for the cancellation.";
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
