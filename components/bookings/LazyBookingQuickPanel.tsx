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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  BookingQuickPanel,
  deriveBookingViewerContext,
  type BookingViewerContext,
} from "@/components/bookings/BookingQuickPanel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useViewer } from "@/lib/auth/viewer-context";
import { BookingDialogTheme } from "@/components/bookings/BookingDialogTheme";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import {
  getBookingDetailAction,
  type BookingDetailPayload,
} from "@/features/bookings/actions/booking-detail";

export type LazyBookingQuickPanelProps = {
  businessSlug?: string;
  themeClassName?: string;
  restoreFocus?: () => void;
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
  /** Invalidate caller-owned booking queries after a confirmed management action. */
  onBookingChanged?: () => void;
  /** Supply a verified layout viewer when this panel is outside ViewerContextProvider. */
  viewerContext?: BookingViewerContext;
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
    hold_expires_at: payload.hold_expires_at ? new Date(payload.hold_expires_at) : null,
    cancelled_at: payload.cancelled_at ? new Date(payload.cancelled_at) : null,
    payments: payload.payments.map((payment) => ({
      ...payment,
      submitted_at: payment.submitted_at ? new Date(payment.submitted_at) : null,
      verified_at: payment.verified_at ? new Date(payment.verified_at) : null,
      paid_at: payment.paid_at ? new Date(payment.paid_at) : null,
      escalated_at: payment.escalated_at ? new Date(payment.escalated_at) : null,
    })),
  } as unknown as Parameters<typeof BookingQuickPanel>[0]["booking"];
}

export function LazyBookingQuickPanel({
  viewerContext,
  themeClassName = "",
  ...props
}: LazyBookingQuickPanelProps) {
  return <BookingDialogTheme.Provider value={themeClassName}>{viewerContext
    ? <LazyBookingQuickPanelContent {...props} themeClassName={themeClassName} viewerContext={viewerContext} />
    : <LazyBookingQuickPanelWithViewer {...props} themeClassName={themeClassName} />}</BookingDialogTheme.Provider>;
}

function LazyBookingQuickPanelWithViewer(props: Omit<LazyBookingQuickPanelProps, "viewerContext">) {
  const viewer = useViewer();
  return <LazyBookingQuickPanelContent {...props} viewerContext={deriveBookingViewerContext(viewer)} />;
}

function LazyBookingQuickPanelContent({
  bookingId,
  open,
  onOpenChange,
  servicesCatalog = [],
  onBookingChanged,
  viewerContext,
  businessSlug,
  themeClassName = "",
  restoreFocus,
}: Omit<LazyBookingQuickPanelProps, "viewerContext"> & { viewerContext: BookingViewerContext }) {
  const [payload, setPayload] = useState<BookingDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const activeBookingId = useRef(bookingId);
  const dialogOpen = useRef(open);
  useLayoutEffect(() => { dialogOpen.current = open; }, [open]);
  const onCloseAutoFocus = useCallback((event: Event) => {
    if (!restoreFocus) return;
    event.preventDefault();
    if (!dialogOpen.current) restoreFocus();
  }, [restoreFocus]);
  useEffect(() => { activeBookingId.current = bookingId; }, [bookingId]);

  const handleBookingChanged = () => {
    onBookingChanged?.();
    if (bookingId == null) return;
    const changedId = bookingId;
    void getBookingDetailAction(changedId).then((res) => {
      if (activeBookingId.current !== changedId) return;
      if (res.success) setPayload(res.booking);
      else {
        toast.error("Booking changed, but its details could not be refreshed.");
        onOpenChange(false);
      }
    }).catch(() => {
      if (activeBookingId.current === changedId) {
        toast.error("Booking changed, but its details could not be refreshed.");
        onOpenChange(false);
      }
    });
  };

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

  // N5: open a lightweight placeholder dialog instantly while the
  // booking-detail server fetch is in flight. Previously this component
  // gated the dialog on `open && !loading`, so a tap on a booking row
  // produced 500ms–1s of dead air before anything appeared — read by
  // users as "the dialog lags". Now the user gets immediate visual
  // feedback (a centered spinner inside the dialog shell) and the real
  // panel mounts once the payload arrives.
  const showPlaceholder = open && loading && !payload;
  return (
    <>
      {showPlaceholder ? (
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent onCloseAutoFocus={onCloseAutoFocus} aria-describedby={undefined} className={`w-[95vw] max-w-2xl h-[90vh] max-h-[90vh] rounded-3xl p-0 gap-0 flex flex-col overflow-hidden bg-white border border-zinc-200 shadow-2xl ${themeClassName}`}>
            <div className="flex shrink-0 justify-center pt-2 pb-1 bg-zinc-50/50">
              <div className="h-1 w-10 rounded-full bg-zinc-300" />
            </div>
            <DialogHeader className="p-6 pb-4 bg-zinc-50/50 border-b border-zinc-100 flex shrink-0">
              <DialogTitle className="text-xl font-bold text-zinc-900 tracking-tight">
                Loading booking…
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 flex items-center justify-center text-zinc-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      <BookingQuickPanel
        businessSlug={businessSlug}
        onCloseAutoFocus={onCloseAutoFocus}
        booking={payload ? reviveBooking(payload) : null}
        servicesCatalog={servicesCatalog}
        open={open && !showPlaceholder}
        onOpenChange={onOpenChange}
        viewerContext={viewerContext}
        onBookingChanged={onBookingChanged ? handleBookingChanged : undefined}
      />
    </>
  );
}
