"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { recordBookingPaymentAction } from "@/lib/server actions/booking-payments";
import { formatCurrency } from "@/lib/utils";
import { PaymentMethod } from "@/prisma/generated/prisma/enums";

const METHODS = [
  [PaymentMethod.CASH, "Cash"],
  [PaymentMethod.GCASH, "GCash"],
  [PaymentMethod.CARD, "Card"],
  [PaymentMethod.BANK_TRANSFER, "Bank transfer"],
  [PaymentMethod.OTHER, "Other"],
] as const;

export function RecordPaymentDialog(props: {
  bookingId: number;
  customerName: string;
  grandTotal: number;
  amountPaid: number;
  trigger?: React.ReactNode;
  onRecorded?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef("");
  const remaining = useMemo(
    () => Math.max(0, Math.round((props.grandTotal - props.amountPaid) * 100) / 100),
    [props.amountPaid, props.grandTotal],
  );
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>(PaymentMethod.CASH);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const numericAmount = Number(amount);
  const error = !Number.isFinite(numericAmount) || numericAmount <= 0
    ? "Enter an amount greater than zero."
    : numericAmount > remaining
      ? "Amount cannot exceed the remaining balance."
      : method === PaymentMethod.GCASH && !reference.trim()
        ? "GCash reference is required."
        : null;

  const reset = () => {
    idempotencyKey.current = crypto.randomUUID();
    setConfirming(false);
    setMethod(PaymentMethod.CASH);
    setReference("");
    setNote("");
  };

  const submit = () => startTransition(async () => {
    const result = await recordBookingPaymentAction({
      bookingId: props.bookingId,
      amount: numericAmount,
      paymentMethod: method,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
      idempotencyKey: idempotencyKey.current || crypto.randomUUID(),
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`Payment recorded. ${formatCurrency(result.remainingBalance)} remaining.`);
    setOpen(false);
    reset();
    await props.onRecorded?.();
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); if (next) { setAmount(String(remaining)); idempotencyKey.current = crypto.randomUUID(); } else reset(); } }}>
      <DialogTrigger asChild>
        {props.trigger ?? (
          <Button type="button" className="min-h-11 rounded-xl">
            <Banknote className="mr-2 size-4" />Record payment
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{confirming ? "Confirm payment" : "Record payment"}</DialogTitle>
          <DialogDescription>
            This records money received for booking #{props.bookingId}. It does not verify a pending booking deposit.
          </DialogDescription>
        </DialogHeader>
        {confirming ? (
          <div className="space-y-3 rounded-2xl border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between gap-4"><span>Customer</span><strong>{props.customerName}</strong></div>
            <div className="flex justify-between gap-4"><span>Amount received</span><strong>{formatCurrency(numericAmount)}</strong></div>
            <div className="flex justify-between gap-4"><span>Method</span><strong>{METHODS.find(([value]) => value === method)?.[1]}</strong></div>
            {reference.trim() ? <div className="flex justify-between gap-4"><span>Reference</span><strong className="break-all text-right">{reference.trim()}</strong></div> : null}
            <div className="flex justify-between gap-4 border-t pt-3"><span>Balance after payment</span><strong>{formatCurrency(remaining - numericAmount)}</strong></div>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/30 p-3 text-sm">
              <div><span className="block text-xs text-muted-foreground">Total</span><strong>{formatCurrency(props.grandTotal)}</strong></div>
              <div><span className="block text-xs text-muted-foreground">Paid</span><strong>{formatCurrency(props.amountPaid)}</strong></div>
              <div><span className="block text-xs text-muted-foreground">Remaining</span><strong>{formatCurrency(remaining)}</strong></div>
            </div>
            <div className="space-y-2"><Label htmlFor={`payment-amount-${props.bookingId}`}>Amount received</Label><Input id={`payment-amount-${props.bookingId}`} type="number" min="0.01" max={remaining} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor={`payment-method-${props.bookingId}`}>Payment method</Label><Select value={method} onValueChange={(value) => setMethod(value as (typeof METHODS)[number][0])}><SelectTrigger id={`payment-method-${props.bookingId}`} className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{METHODS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor={`payment-reference-${props.bookingId}`}>Reference {method === PaymentMethod.GCASH ? "(required)" : "(optional)"}</Label><Input id={`payment-reference-${props.bookingId}`} maxLength={100} value={reference} onChange={(event) => setReference(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor={`payment-note-${props.bookingId}`}>Note (optional)</Label><Textarea id={`payment-note-${props.bookingId}`} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}
        <DialogFooter>
          {confirming ? <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => setConfirming(false)}>Back</Button> : null}
          <Button type="button" className="min-h-11" disabled={Boolean(error) || pending} onClick={() => confirming ? submit() : setConfirming(true)}>
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {confirming ? "Confirm and record" : "Review payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
