"use client";
import { useBookingDialogTheme } from "@/components/bookings/BookingDialogTheme";

/**
 * AdjustPriceDialog — apply a manual discount or surcharge to a
 * booking. Calls adjustBookingPriceAction. Permission gating happens
 * at the call site via viewerContext.canAdjustPrice (BOOKING_ADJUST_PRICE).
 *
 * Form shape:
 *   - "Apply to" picker: whole booking (default) or a specific service line.
 *   - Sign toggle (Discount / Surcharge) + amount input — the action's
 *     deltaAmount is computed as ±amount based on sign so users never
 *     have to type a negative number.
 *   - Reason textarea (required).
 *
 * Server-side guards (booking ACCEPTED, not fully PAID, resulting
 * total >= 0, etc.) are reflected as toast messages on rejection.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Percent } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import { adjustBookingPriceAction } from "@/features/bookings/actions/booking-modify";

const MAX_REASON_LENGTH = 500;

export type AdjustPriceDialogProps = {
  bookingId: number;
  /**
   * Lines on the booking the user can target. Pass empty / omit to
   * restrict to whole-booking adjustments only.
   */
  lines?: ReadonlyArray<{ id: number; serviceName: string; finalPrice: number }>;
  /** Optional override for the trigger element. */
trigger?: React.ReactNode;
  onChanged?: () => void;
};

const formatCurrency = (amount: number) =>
  `PHP ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function AdjustPriceDialog({
  bookingId,
  lines = [],
trigger,
  onChanged,
}: AdjustPriceDialogProps) {
  const router = useRouter();
  const staffDialogTheme = useBookingDialogTheme();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>("BOOKING"); // "BOOKING" or stringified line id
  const [sign, setSign] = useState<"DISCOUNT" | "SURCHARGE">("DISCOUNT");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset form on each open.
  useEffect(() => {
    if (open) {
      setTarget("BOOKING");
      setSign("DISCOUNT");
      setAmount("");
      setReason("");
    }
  }, [open]);

  const numericAmount = useMemo(() => {
    const n = Number.parseFloat(amount);
    return Number.isFinite(n) ? n : NaN;
  }, [amount]);

  const trimmedReason = reason.trim();
  const canSubmit =
    Number.isFinite(numericAmount) &&
    Math.abs(numericAmount) > 0 &&
    trimmedReason.length > 0 &&
    trimmedReason.length <= MAX_REASON_LENGTH &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const deltaAmount =
        sign === "DISCOUNT" ? -Math.abs(numericAmount) : Math.abs(numericAmount);
      const availedServiceId =
        target === "BOOKING" ? undefined : Number.parseInt(target, 10);
      const result = await adjustBookingPriceAction({
        bookingId,
        availedServiceId,
        deltaAmount,
        reason: trimmedReason,
      });
      if (!result.success) {
        showActionErrorToast(result.error, { action: "adjust this booking's price" });
        return;
      }
      toast.success(
        `Booking ${
          sign === "DISCOUNT" ? "discounted" : "surcharged"
        } by ${formatCurrency(Math.abs(numericAmount))}`,
      );
      setOpen(false);
      if (onChanged) onChanged();
      else router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showActionErrorToast(msg, { action: "adjust this booking's price" });
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
            size="sm"
            className="h-9 rounded-full border-primary/30 px-4 text-primary hover:bg-primary/[0.06] hover:text-primary hover:border-primary/50"
          >
            <Percent className="h-4 w-4 mr-2" />
            Adjust price
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={`rounded-3xl ${staffDialogTheme}`}>
        <DialogHeader>
          <DialogTitle>Adjust booking price</DialogTitle>
          <DialogDescription>
            Apply a discount or surcharge with a reason. The reason is
            recorded permanently in the booking&apos;s adjustment history
            and visible on the customer&apos;s receipt.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {lines.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="adjust-target">Apply to</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id="adjust-target" className="rounded-xl">
                  <SelectValue placeholder="Whole booking" />
                </SelectTrigger>
                <SelectContent className={`rounded-xl ${staffDialogTheme}`}>
                  <SelectItem value="BOOKING">Whole booking</SelectItem>
                  {lines.map((line) => (
                    <SelectItem key={line.id} value={String(line.id)}>
                      {line.serviceName} ({formatCurrency(line.finalPrice)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2 col-span-1">
              <Label htmlFor="adjust-sign">Type</Label>
              <Select
                value={sign}
                onValueChange={(v) => setSign(v as "DISCOUNT" | "SURCHARGE")}
              >
                <SelectTrigger id="adjust-sign" className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={`rounded-xl ${staffDialogTheme}`}>
                  <SelectItem value="DISCOUNT">Discount</SelectItem>
                  <SelectItem value="SURCHARGE">Surcharge</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="adjust-amount">Amount (PHP)</Label>
              <Input
                id="adjust-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-reason">Reason</Label>
            <textarea
              id="adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Loyalty discount, premium upgrade, complaint comp"
              maxLength={MAX_REASON_LENGTH}
              rows={3}
              required
              disabled={submitting}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            />
            <p className="text-xs text-muted-foreground">
              {trimmedReason.length}/{MAX_REASON_LENGTH}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!canSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>Apply adjustment</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
