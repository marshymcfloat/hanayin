/**
 * Centralized helpers for displaying customer info on a Booking that may be
 * anonymous (customer_id = null, is_anonymous_walk_in = true).
 *
 * Use these instead of reaching into `booking.customer.name` directly so the
 * "Walk-in" fallback is consistent across the dashboard, lists, and exports.
 */

export type BookingCustomerLike = {
  // Optional so callers with narrower booking shapes (server-action selects
  // that only pull customer.name) can still pass through. Both default to
  // "not anonymous" when absent.
  is_anonymous_walk_in?: boolean | null;
  customer_label?: string | null;
  customer: { name: string; email?: string | null; phone?: string | null } | null;
};

/**
 * Best display name for a booking's customer.
 * - Anonymous walk-in with a label → "Walk-in: <label>"
 * - Anonymous walk-in without a label → "Anonymous walk-in"
 * - Linked customer → customer.name
 * - Missing customer (data inconsistency) → "Unknown customer"
 */
export function getBookingCustomerName(booking: BookingCustomerLike): string {
  if (booking.is_anonymous_walk_in) {
    const label = booking.customer_label?.trim();
    return label ? `Walk-in: ${label}` : "Anonymous walk-in";
  }
  return booking.customer?.name ?? "Unknown customer";
}

/**
 * Whether this booking can be matched back to a Customer record (and therefore
 * appears in customer rankings, history, re-engagement, etc.). False for
 * anonymous walk-ins.
 */
export function isLinkedToCustomerProfile(
  booking: Pick<BookingCustomerLike, "is_anonymous_walk_in" | "customer">,
): boolean {
  return !booking.is_anonymous_walk_in && !!booking.customer;
}
