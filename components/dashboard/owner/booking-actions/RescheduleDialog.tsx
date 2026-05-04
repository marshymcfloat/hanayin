"use client";

/**
 * RescheduleDialog — open from the booking panel to move an ACCEPTED
 * booking to a different time. Calls rescheduleBookingAction; the
 * server-side guards (status === ACCEPTED, no SERVING/COMPLETED line,
 * future time, different from current) are reflected as toast
 * messages on rejection.
 *
 * Permission gating happens at the call site via <PermissionGate
 * require="BOOKING_MODIFY"> wrapping the trigger button.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import { rescheduleBookingAction } from "@/lib/server actions/booking-modify";

export type RescheduleDialogProps = {
  bookingId: number;
  /** ISO string of the booking's current scheduled_at, or null. */
  currentScheduledAt: string | null;
  /** Optional override for the trigger; defaults to a "Reschedule" button. */
  trigger?: React.ReactNode;
};

/** Convert an ISO string to the value format <input type="datetime-local"> expects. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // YYYY-MM-DDTHH:mm — pad each component.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function RescheduleDialog({
  bookingId,
  currentScheduledAt,
  trigger,
}: RescheduleDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(toLocalInputValue(currentScheduledAt));
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the dialog re-opens or the booking changes.
  useEffect(() => {
    if (open) setValue(toLocalInputValue(currentScheduledAt));
  }, [open, currentScheduledAt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value) {
      toast.error("Please pick a date and time.");
      return;
    }
    setSubmitting(true);
    try {
      const newScheduledAt = new Date(value);
      const result = await rescheduleBookingAction({
        bookingId,
        newScheduledAt,
      });
      if (!result.success) {
        showActionErrorToast(result.error, { action: "reschedule this booking" });
        return;
      }
      toast.success("Booking rescheduled");
      setOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showActionErrorToast(msg, { action: "reschedule this booking" });
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
            className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Reschedule
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Reschedule booking</DialogTitle>
          <DialogDescription>
            Pick a new date and time. Service lines shift by the same delta;
            payment and pricing are unchanged. The customer will be re-eligible
            for a reminder at the new time.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reschedule-datetime">New date &amp; time</Label>
            <Input
              id="reschedule-datetime"
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-xl"
              disabled={submitting || !value}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>Save reschedule</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
