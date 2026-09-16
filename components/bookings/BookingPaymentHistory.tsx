"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatPH } from "@/lib/date-utils";
import { voidBookingPaymentAction } from "@/features/payments/actions/booking-payments";
import { formatCurrency } from "@/lib/utils";
import type { BookingPayment } from "@/prisma/generated/prisma/client";

function PaymentRow({ payment, canVoid }: { payment: BookingPayment; canVoid: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const voidPayment = () => startTransition(async () => {
    const result = await voidBookingPaymentAction({ paymentId: payment.id, reason });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Payment voided and booking balance recalculated.");
    router.refresh();
  });
  return <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0 text-sm">
      <div className="flex flex-wrap items-center gap-2"><strong>{formatCurrency(payment.amount_principal)}</strong><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{payment.payment_method.replaceAll("_", " ")}</span><span className="text-xs text-muted-foreground">{payment.status}</span></div>
      <p className="mt-1 text-xs text-muted-foreground">{payment.paid_at ? formatPH(payment.paid_at, "MMM d, h:mm a") : "No payment date"}{payment.provider_reference ? ` · ${payment.provider_reference}` : ""}</p>
      {payment.void_reason ? <p className="mt-1 text-xs text-destructive">Void reason: {payment.void_reason}</p> : null}
    </div>
    {canVoid && payment.status === "SUCCEEDED" ? <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" className="min-h-11 text-destructive">Void payment</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Void this payment?</AlertDialogTitle><AlertDialogDescription>This corrects an erroneous internal entry. It does not issue a customer refund.</AlertDialogDescription></AlertDialogHeader><Textarea aria-label="Void reason" placeholder="Reason for voiding" minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={pending || reason.trim().length < 3} onClick={voidPayment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Void payment</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}
  </li>;
}

export function BookingPaymentHistory({ payments, canVoid }: { payments: BookingPayment[]; canVoid: boolean }) {
  const ledger = payments.filter((payment) => payment.status === "SUCCEEDED" || payment.status === "CANCELED");
  if (!ledger.length) return null;
  return <section className="space-y-2"><h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Payment history</h3><ul className="divide-y rounded-2xl border px-4">{ledger.map((payment) => <PaymentRow key={payment.id} payment={payment} canVoid={canVoid} />)}</ul></section>;
}
