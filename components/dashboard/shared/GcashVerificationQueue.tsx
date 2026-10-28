"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  approveGcashPaymentAction,
  escalateGcashPaymentAction,
  rejectGcashPaymentAction,
  resolveGcashFollowUpAction,
} from "@/features/payments/actions/manual-gcash";
import {
  GCASH_REJECTION_REASONS,
  type GcashFollowUpItem,
  type GcashResolutionOutcome,
  type GcashVerificationItem,
} from "@/lib/types/manual-gcash";
import type {
  OwnerGcashFollowUpItem,
  OwnerGcashVerificationItem,
} from "@/features/payments/types/owner-gcash-review";
import { cn, formatCurrency } from "@/lib/utils";

type ReviewMode = "verify" | "reject" | "escalate" | null;
type VerificationQueueItem = GcashVerificationItem | OwnerGcashVerificationItem;
type FollowUpQueueItem = GcashFollowUpItem | OwnerGcashFollowUpItem;

function dateTime(value: Date | string | null) {
  return value
    ? new Date(value).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not provided";
}

export function GcashVerificationQueue({
  businessSlug,
  items,
  compact = false,
  total = items.length,
  onSuccess,
  themeClassName = "",
}: {
  businessSlug: string;
  items: VerificationQueueItem[];
  compact?: boolean;
  total?: number;
  onSuccess?: () => void;
  themeClassName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const submissionLock = useRef(false);
  const [selected, setSelected] = useState<VerificationQueueItem | null>(null);
  const [mode, setMode] = useState<ReviewMode>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const reset = () => {
    setMode(null);
    setSelected(null);
    setReason("");
    setNote("");
  };
  const close = () => {
    if (!pending) reset();
  };
  const open = (
    item: VerificationQueueItem,
    nextMode: Exclude<ReviewMode, null>,
  ) => {
    setSelected(item);
    setMode(nextMode);
  };

  const submit = () => {
    if (!selected || !mode || submissionLock.current) return;
    submissionLock.current = true;
    startTransition(async () => {
      try {
      const result =
        mode === "verify"
          ? await approveGcashPaymentAction({
              paymentId: selected.id,
              businessSlug,
              source: "CUSTOMER_SUBMITTED",
              attestation: {
                transactionFound: true,
                recipientMatched: true,
                amountMatched: true,
                detailsReviewed: true,
              },
            })
          : mode === "reject"
            ? await rejectGcashPaymentAction({
                paymentId: selected.id,
                businessSlug,
                reason,
                internalNote: note,
              })
            : await escalateGcashPaymentAction({
                paymentId: selected.id,
                businessSlug,
                reason: note,
              });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        mode === "verify"
          ? "Payment verified and booking confirmed."
          : mode === "reject"
            ? "Payment rejected and slot released."
            : "Payment moved to needs resolution.",
      );
      reset();
      if (onSuccess) onSuccess();
      else router.refresh();
      } catch {
        toast.error("Could not confirm the payment action. Check its status before retrying.");
      } finally {
        submissionLock.current = false;
      }
    });
  };

  if (!items.length) return null;
  return (
    <section
      className={cn(
        "w-full rounded-3xl border border-amber-200 bg-amber-50/60",
        compact ? "p-4" : "mx-auto mb-5 max-w-7xl p-4 sm:p-6",
      )}
      aria-labelledby="gcash-verification-heading"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
            Action required · {total}
          </p>
          <h2
            id="gcash-verification-heading"
            className={cn("font-semibold", compact ? "text-base" : "text-xl")}
          >
            GCash payments awaiting verification
          </h2>
        </div>
        {compact ? (
          <Link
            href={`/app/${businessSlug}/bookings`}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View all <ArrowRight className="size-4" />
          </Link>
        ) : null}
      </div>
      <div className={cn("grid gap-3", !compact && "lg:grid-cols-2")}>
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border bg-white p-4 shadow-sm"
          >
            <div className="flex justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.booking.customerName}</p>
                  {item.stage === "NEEDS_RESOLUTION" ? (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-800">
                      Needs resolution
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  Booking #{item.booking.id} ·{" "}
                  {item.booking.services.join(", ")}
                </p>
              </div>
              <p className="font-bold text-primary tabular-nums">
                {formatCurrency(item.amountPrincipal)}
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Payer</dt>
                <dd className="font-medium">
                  {item.payerName || "Not provided"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reference</dt>
                <dd className="break-all font-mono font-medium">
                  {item.providerReference || "Not provided"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Appointment</dt>
                <dd>{dateTime(item.booking.scheduledAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Review by</dt>
                <dd>{dateTime(item.expiresAt)}</dd>
              </div>
              {!compact ? (
                <>
                  <div>
                    <dt className="text-muted-foreground">Submitted</dt>
                    <dd>{dateTime(item.submittedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">GCash destination</dt>
                    <dd>
                      {item.destination.accountName}
                      <br />
                      {item.destination.mobileNumber}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {item.escalationReason ? (
              <p className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
                <strong>Issue:</strong> {item.escalationReason}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => open(item, "escalate")}
              >
                Escalate
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => open(item, "reject")}
              >
                Reject
              </Button>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => open(item, "verify")}
              >
                <ShieldCheck className="mr-2 size-4" />
                Review payment
              </Button>
            </div>
          </article>
        ))}
      </div>
      <Dialog
        open={Boolean(mode && selected)}
        onOpenChange={(next) => !next && close()}
      >
        <DialogContent className={cn("max-w-lg rounded-3xl", themeClassName)}>
          <DialogHeader>
            <DialogTitle>
              {mode === "verify"
                ? "Confirm GCash payment"
                : mode === "reject"
                  ? "Reject payment"
                  : "Escalate payment"}
            </DialogTitle>
            <DialogDescription>
              {mode === "verify"
                ? "Check the salon’s actual GCash transaction history before confirming this appointment."
                : mode === "reject"
                  ? "The booking will be cancelled and its slot released."
                  : "The slot stays held only until the current verification deadline."}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span>Booking #{selected.booking.id}</span>
                <strong>{formatCurrency(selected.amountPrincipal)}</strong>
              </div>
              <p className="mt-1 text-muted-foreground">
                To {selected.destination.accountName} ·{" "}
                {selected.destination.mobileNumber}
              </p>
            </div>
          ) : null}
          {mode === "verify" ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-900">
              Continue only after finding this transaction in the salon&apos;s
              GCash history and confirming the recipient and amount shown above.
            </p>
          ) : mode === "reject" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rejection-reason">Customer-facing reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger id="rejection-reason">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent className={themeClassName}>
                    {GCASH_REJECTION_REASONS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rejection-note">Internal note (optional)</Label>
                <Textarea
                  id="rejection-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={500}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="escalation-reason">
                Mismatch or investigation details
              </Label>
              <Textarea
                id="escalation-reason"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={240}
                placeholder="Explain what does not match…"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={
                pending ||
                (mode === "reject" && !reason) ||
                (mode === "escalate" && !note.trim())
              }
            >
              {pending
                ? "Saving…"
                : mode === "verify"
                  ? "Confirm payment"
                  : mode === "reject"
                    ? "Reject and release slot"
                    : "Mark needs resolution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function GcashFollowUpQueue({
  businessSlug,
  items,
  compact = false,
  onSuccess,
  themeClassName = "",
}: {
  businessSlug: string;
  items: FollowUpQueueItem[];
  compact?: boolean;
  onSuccess?: () => void;
  themeClassName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const submissionLock = useRef(false);
  const [selected, setSelected] = useState<FollowUpQueueItem | null>(null);
  const [outcome, setOutcome] = useState<GcashResolutionOutcome | "">("");
  const [note, setNote] = useState("");
  if (!items.length) return null;
  return (
    <section
      className={cn(
        "w-full rounded-3xl border border-red-200 bg-red-50/60 p-4",
        !compact && "mx-auto mb-5 max-w-7xl sm:p-6",
      )}
      aria-labelledby="gcash-follow-up-heading"
    >
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
          Money follow-up · {items.length}
        </p>
        <h2 id="gcash-follow-up-heading" className="text-lg font-semibold">
          Expired payments requiring owner review
        </h2>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-2xl border bg-white p-4">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-semibold">{item.booking.customerName}</p>
                <p className="text-xs text-muted-foreground">
                  Booking #{item.booking.id} ·{" "}
                  {item.booking.customerPhone || "No phone"}
                </p>
              </div>
              <strong className="text-red-700">
                {formatCurrency(item.amountPrincipal)}
              </strong>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Submitted {dateTime(item.submittedAt)} · Follow-up created{" "}
              {dateTime(item.followUpRequiredAt)}
            </p>
            {item.escalationReason ? (
              <p className="mt-2 text-xs text-orange-900">
                Issue: {item.escalationReason}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="mt-3 min-h-11 w-full"
              onClick={() => setSelected(item)}
            >
              <AlertTriangle className="mr-2 size-4" />
              Resolve follow-up
            </Button>
          </article>
        ))}
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(next) => {
          if (!next && !pending) setSelected(null);
        }}
      >
        <DialogContent className={cn("max-w-md rounded-3xl", themeClassName)}>
          <DialogHeader>
            <DialogTitle>Resolve payment follow-up</DialogTitle>
            <DialogDescription>
              The booking slot has already been released. Record what happened
              to the possible payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="resolution-outcome">Outcome</Label>
            <Select
              value={outcome}
              onValueChange={(value) =>
                setOutcome(value as GcashResolutionOutcome)
              }
            >
              <SelectTrigger id="resolution-outcome">
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent className={themeClassName}>
                <SelectItem value="NO_PAYMENT_FOUND">
                  No payment found
                </SelectItem>
                <SelectItem value="REFUNDED">Payment refunded</SelectItem>
                <SelectItem value="REBOOKED">Customer rebooked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="resolution-note">Internal note (optional)</Label>
            <Textarea
              id="resolution-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelected(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              disabled={pending || !outcome}
              onClick={() =>
                selected &&
                startTransition(async () => {
                  if (submissionLock.current) return;
                  submissionLock.current = true;
                  try {
                  const result = await resolveGcashFollowUpAction({
                    paymentId: selected.id,
                    businessSlug,
                    outcome: outcome as GcashResolutionOutcome,
                    note,
                  });
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Follow-up resolved.");
                  setSelected(null);
                  setOutcome("");
                  setNote("");
                  if (onSuccess) onSuccess();
                  else router.refresh();
                  } catch {
                    toast.error("Could not confirm the resolution. Check its status before retrying.");
                  } finally {
                    submissionLock.current = false;
                  }
                })
              }
            >
              {pending ? "Saving…" : "Save resolution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
