"use client";

/**
 * SwapServiceDialog — per-service-line trigger that replaces the line
 * with a different service in a single transaction. Calls
 * swapBookingServiceAction (BOOKING_MODIFY gated; owner short-circuit).
 *
 * Visibility mirrors the server-side guards in
 * checkAvailedServiceRemovable (booking ACCEPTED + unpaid, line PENDING,
 * >1 service line). When a single-line swap becomes a real use case
 * (customer changes their mind on their only service) we can relax the
 * helper into a checkAvailedServiceSwappable variant; for now the UI
 * stays in lockstep with the action.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showActionErrorToast } from "@/components/feedback/permission-toasts";
import { swapBookingServiceAction } from "@/features/bookings/actions/booking-modify";

const formatCurrency = (amount: number) =>
  `PHP ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export type SwapServiceDialogProps = {
  bookingId: number;
  availedServiceId: number;
  /** Display name of the line being swapped, for header copy. */
  currentServiceName: string;
  /** Service id of the line being swapped — filtered out of the picker. */
  currentServiceId: number;
  /** Catalog of services the user can swap to. */
  servicesCatalog: ReadonlyArray<{
    id: number;
    name: string;
    category: string;
    price: number;
  }>;
  /** Optional override for the trigger element. */
  trigger?: React.ReactNode;
};

export function SwapServiceDialog({
  bookingId,
  availedServiceId,
  currentServiceName,
  currentServiceId,
  servicesCatalog,
  trigger,
}: SwapServiceDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickedServiceId, setPickedServiceId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset picker on each open.
  useEffect(() => {
    if (open) setPickedServiceId("");
  }, [open]);

  const options = servicesCatalog.filter((s) => s.id !== currentServiceId);
  const canSubmit = pickedServiceId !== "" && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await swapBookingServiceAction({
        bookingId,
        availedServiceId,
        newServiceId: Number.parseInt(pickedServiceId, 10),
      });
      if (!result.success) {
        showActionErrorToast(result.error, { action: "swap this service" });
        return;
      }
      toast.success("Service swapped");
      setOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showActionErrorToast(msg, { action: "swap this service" });
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
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full text-muted-foreground/70 hover:text-primary hover:bg-primary/[0.06]"
            aria-label={`Swap ${currentServiceName}`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Swap &ldquo;{currentServiceName}&rdquo;</DialogTitle>
          <DialogDescription>
            Replace this line with a different service. Pricing and timing
            recalculate automatically; the customer is not notified
            automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="swap-service">Replace with</Label>
            {options.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No other services available in your catalog.
              </p>
            ) : (
              <Select
                value={pickedServiceId}
                onValueChange={setPickedServiceId}
              >
                <SelectTrigger id="swap-service" className="rounded-xl">
                  <SelectValue placeholder="Pick a replacement service" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {options.map((service) => (
                    <SelectItem key={service.id} value={String(service.id)}>
                      {service.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {service.category} · {formatCurrency(service.price)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
              disabled={!canSubmit || options.length === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Swapping...
                </>
              ) : (
                <>Swap service</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
