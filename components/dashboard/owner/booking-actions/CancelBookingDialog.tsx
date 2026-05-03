"use client";

/**
 * CancelBookingDialog — soft-cancel a booking with a required reason.
 * Distinct from the existing dropdown "Cancel" item in BookingList,
 * which uses updateBookingStatusAction without recording a reason or
 * the cancelling actor. This dialog goes through cancelBookingAction,
 * sets the new soft-cancel fields, and gates by BOOKING_CANCEL.
 *
 * The trigger is gated at the call site by viewerContext.canCancel.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import { cancelBookingAction } from "@/lib/server actions/booking-modify";

const MAX_REASON_LENGTH = 500;

export type CancelBookingDialogProps = {
  bookingId: number;
  /** Display name used in the confirmation copy (no PII leak — this stays in dialog). */
  customerLabel: string;
  /** Optional override for the trigger element. */
  trigger?: React.ReactNode;
};

export function CancelBookingDialog({
  bookingId,
  customerLabel,
  trigger,
}: CancelBookingDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset on each open so the previous reason doesn't linger.
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_REASON_LENGTH;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await cancelBookingAction({ bookingId, reason: trimmed });
      if (!result.success) {
        showActionErrorToast(result.error, { action: "cancel this booking" });
        return;
      }
      toast.success("Booking cancelled");
      setOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showActionErrorToast(msg, { action: "cancel this booking" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel booking
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>
            This will mark <strong>{customerLabel}</strong>&apos;s booking as
            cancelled and notify the customer. The reason is recorded in the
            audit trail.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer requested, double-booked, staff unavailable"
              maxLength={MAX_REASON_LENGTH}
              rows={3}
              required
              disabled={submitting}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-60"
            />
            <p className="text-xs text-muted-foreground">
              {trimmed.length}/{MAX_REASON_LENGTH}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Keep booking
            </Button>
            <Button
              type="submit"
              className="rounded-xl bg-red-600 text-white hover:bg-red-700"
              disabled={submitting || !canSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>Confirm cancel</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
