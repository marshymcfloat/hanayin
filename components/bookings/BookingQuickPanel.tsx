/**
 * BookingQuickPanel — universal entry point for viewing and adjusting a
 * booking from any role's dashboard. This is a thin re-export of the
 * underlying BookingDetailsDialog with a permissions-aware viewerContext
 * prop, so owners, managers, cashiers, and staff can all open the same
 * panel and only see actions they're allowed to perform.
 *
 * The original BookingDetailsDialog (in components/dashboard/owner/) keeps
 * its existing default-owner behavior for legacy callers like BookingList,
 * which doesn't pass a viewerContext and continues to render every action.
 *
 * For role-aware callers there are two ergonomic paths:
 *   1. {@link deriveBookingViewerContext} — preferred. Takes a
 *      ViewerContextValue (the shared client-side context) and produces
 *      the four-flag BookingViewerContext the panel reads.
 *   2. {@link deriveViewerContext} — legacy API. Takes role + profile +
 *      permissions directly. Kept for back-compat; new callers should
 *      prefer the ViewerContextValue path so the rules live in one place.
 */

export {
  BookingDetailsDialog as BookingQuickPanel,
  type BookingViewerContext,
} from "@/components/dashboard/owner/BookingDetailsDialog";

import type { BookingViewerContext } from "@/components/dashboard/owner/BookingDetailsDialog";
import type { ViewerContextValue } from "@/lib/auth/viewer-context";
import {
  Role,
  StaffPermission,
  StaffProfile,
} from "@/prisma/generated/prisma/enums";

/**
 * Preferred derivation: feed in the shared ViewerContextValue (typically
 * `useViewer()` output) and get the booking-panel's four flags.
 */
export function deriveBookingViewerContext(
  viewer: ViewerContextValue,
): BookingViewerContext {
  return deriveViewerContext({
    role: viewer.role === Role.OWNER ? "OWNER" : "EMPLOYEE",
    staffProfile: mapStaffProfile(viewer.staffProfile),
    permissions: viewer.permissions as ReadonlyArray<keyof typeof StaffPermission>,
  });
}

function mapStaffProfile(
  profile: StaffProfile | null,
): "STAFF" | "MANAGER" | "CASHIER" | null {
  if (profile === StaffProfile.MANAGER) return "MANAGER";
  if (profile === StaffProfile.CASHIER) return "CASHIER";
  if (profile === StaffProfile.STAFF) return "STAFF";
  return null;
}

/**
 * Legacy derivation. Centralizes the rules so every page that opens the
 * panel computes permissions identically.
 *
 * Top-level rules:
 *   - OWNER: everything enabled.
 *   - MANAGER (StaffProfile): can add services, mark paid, mark no-show
 *     when they have QUEUE_OVERRIDE_ALL. Cannot delete bookings.
 *   - CASHIER (StaffProfile): can mark paid (PAYMENT_COLLECT) and add
 *     services (BOOKING_CREATE). No no-show / no delete.
 *   - STAFF (regular employee): the panel is intended for them to view
 *     their own claimed bookings — read-only on most actions, except
 *     they can record payment if PAYMENT_COLLECT is granted.
 *
 * New callers should prefer {@link deriveBookingViewerContext}.
 */
export function deriveViewerContext(input: {
  role: "OWNER" | "EMPLOYEE";
  staffProfile?: "STAFF" | "MANAGER" | "CASHIER" | null;
  /**
   * Accepts any current StaffPermission key. The function itself only
   * looks at a small subset (BOOKING_CREATE / PAYMENT_COLLECT /
   * QUEUE_OVERRIDE_ALL) but typing the parameter narrowly was
   * causing brittleness whenever the enum grows. Stay aligned with
   * the live enum so callers don't have to filter or downcast.
   */
  permissions?: ReadonlyArray<keyof typeof StaffPermission>;
}): BookingViewerContext {
  if (input.role === "OWNER") {
    return {
      role: "OWNER",
      canAddService: true,
      canMarkPaid: true,
      canMarkNoShow: true,
      canDelete: true,
      canCancel: true,
      canAdjustPrice: true,
      canReassignStaff: true,
    };
  }

  const perms = new Set(input.permissions ?? []);
  const profile = input.staffProfile ?? "STAFF";
  const hasOverride = perms.has("QUEUE_OVERRIDE_ALL");

  if (profile === "MANAGER") {
    return {
      role: "MANAGER",
      // Per docs/role-permissions-matrix.md: managers can add services
      // when they have BOOKING_MODIFY (or the legacy BOOKING_CREATE).
      // QUEUE_OVERRIDE_ALL also implies the manager can shape booking
      // scope as part of running the floor.
      canAddService:
        perms.has("BOOKING_MODIFY") ||
        perms.has("BOOKING_CREATE") ||
        hasOverride,
      canMarkPaid: perms.has("PAYMENT_COLLECT") || hasOverride,
      // canMarkNoShow now sources from the dedicated permission flag,
      // not QUEUE_OVERRIDE_ALL. The default-permissions matrix grants
      // BOOKING_MARK_NO_SHOW to managers automatically; this just
      // narrows the gate to the explicit flag.
      canMarkNoShow: perms.has("BOOKING_MARK_NO_SHOW"),
      // Owners only — managers shouldn't be able to permanently delete
      // bookings even with override, since delete is irreversible.
      canDelete: false,
      canCancel: perms.has("BOOKING_CANCEL"),
      canAdjustPrice: perms.has("BOOKING_ADJUST_PRICE"),
      canReassignStaff: hasOverride,
    };
  }

  if (profile === "CASHIER") {
    return {
      role: "CASHIER",
      canAddService: perms.has("BOOKING_CREATE"),
      canMarkPaid: perms.has("PAYMENT_COLLECT"),
      // No-show is a queue/scheduling decision, not a payment one.
      canMarkNoShow: false,
      canDelete: false,
      canCancel: false,
      canAdjustPrice: perms.has("BOOKING_ADJUST_PRICE"),
      canReassignStaff: false,
    };
  }

  // Default: STAFF. Mostly read-only — staff can see their bookings,
  // record payment when PAYMENT_COLLECT is granted, and (when an owner
  // explicitly opts them in via BOOKING_MODIFY) add services to an
  // existing booking. BOOKING_MODIFY is intentionally NOT in the STAFF
  // default permissions, so this stays opt-in: an admin has to flip
  // the toggle on the employee record. BOOKING_CREATE is for creating
  // new bookings, not modifying existing ones, so it does not unlock
  // add-service at this tier.
  //
  // Other booking-scope changes (cancel, no-show, price adjust,
  // reassign) remain owner/manager-only even when the underlying
  // permission is toggled on the employee record.
  return {
    role: "STAFF",
    canAddService: perms.has("BOOKING_MODIFY"),
    canMarkPaid: perms.has("PAYMENT_COLLECT"),
    canMarkNoShow: false,
    canDelete: false,
    canCancel: false,
    canAdjustPrice: false,
    canReassignStaff: false,
  };
}
