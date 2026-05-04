"use client";

/**
 * LazyBookingQuickPanel — open the role-aware BookingQuickPanel when
 * the caller only has a bookingId in hand (e.g. customer profile
 * booking history rows, queue cards, notification deep-links).
 *
 * Fetches the full booking detail via getBookingDetailAction on open
 * and converts the JSON-friendly payload back into the Prisma-shaped
 * objects the panel expects (Dates from ISO strings, etc.).
 *
 * Tenant scoping is enforced server-side; out-of-tenant booking ids
 * surface as a "Booking not found" toast and the panel closes.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookingQuickPanel,
  deriveBookingViewerContext,
} from "@/components/bookings/BookingQuickPanel";
import { useViewer } from "@/lib/auth/viewer-context";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import {
  getBookingDetailAction,
  type BookingDetailPayload,
} from "@/lib/server actions/booking-detail";

export type LazyBookingQuickPanelProps = {
  bookingId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  servicesCatalog?: {
    id: number;
    name: string;
    category: string;
    price: number;
    duration: number | null;
  }[];
};

/**
 * Convert the JSON-serialized payload back to the shape the panel's
 * BookingDetailsDialog expects — Date objects instead of ISO strings.
 * The panel reads booking.scheduled_at / created_at via formatPH which
 * expects Date instances.
 */
function reviveBooking(payload: BookingDetailPayload) {
  return {
    ...payload,
    scheduled_at: payload.scheduled_at ? new Date(payload.scheduled_at) : null,
    estimated_end: payload.estimated_end ? new Date(payload.estimated_end) : null,
    created_at: new Date(payload.created_at),
    // The panel sometimes destructures availed_services with Date-ish fields
    // (status timestamps); we don't carry those in the payload because the
    // panel's table doesn't render them. If a future caller needs them we
    // can widen BookingDetailPayload.
  } as unknown as Parameters<typeof BookingQuickPanel>[0]["booking"];
}

export function LazyBookingQuickPanel({
  bookingId,
  open,
  onOpenChange,
  servicesCatalog = [],
}: LazyBookingQuickPanelProps) {
  const viewer = useViewer();
  const viewerContext = deriveBookingViewerContext(viewer);
  const [payload, setPayload] = useState<BookingDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);

  // Wave G2 follow-up: react-hooks/set-state-in-effect rejects calling
  // setState synchronously inside a useEffect body. We split the
  // "reset on (open|bookingId) change" responsibility into a
  // prev-value comparison during render (the React-docs canonical
  // pattern), and keep only the async fetch and its post-resolution
  // setStates inside the effect — those are inside .then callbacks,
  // which the rule is happy with.
  const triggerKey = `${open ? "1" : "0"}:${bookingId ?? "null"}`;
  const [lastTriggerKey, setLastTriggerKey] = useState(triggerKey);
  if (triggerKey !== lastTriggerKey) {
    setLastTriggerKey(triggerKey);
    setPayload(null);
    setLoading(open && bookingId != null);
  }

  // (Re)fetch each time the panel is opened with a fresh id. We
  // deliberately don't cache cross-renders — booking state changes
  // mid-session and stale data inside the panel could lead to stale
  // permission decisions on the actions.
  useEffect(() => {
    if (!open || bookingId == null) {
      return;
    }
    let cancelled = false;
    getBookingDetailAction(bookingId)
      .then((res) => {
        if (cancelled) return;
        if (!res.success) {
          showActionErrorToast(res.error, { action: "open this booking" });
          onOpenChange(false);
          return;
        }
        setPayload(res.booking);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        toast.error(msg);
        onOpenChange(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, open, onOpenChange]);

  // While loading, render the panel "open" with a null booking — the
  // dialog already returns null when booking is null so the user sees
  // their previous trigger affordance instead of a flicker. Once data
  // arrives, the panel populates.
  return (
    <BookingQuickPanel
      booking={payload ? reviveBooking(payload) : null}
      servicesCatalog={servicesCatalog}
      open={open && !loading}
      onOpenChange={onOpenChange}
      viewerContext={viewerContext}
    />
  );
}
