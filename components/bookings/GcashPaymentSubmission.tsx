"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitGcashPaymentAction } from "@/lib/server actions/manual-gcash";
import { Download } from "lucide-react";

export function GcashPaymentSubmission(props: {
  bookingId: number;
  businessSlug: string;
  token: string;
  amount: number;
  expiresAt: string;
  submittedAt?: string | null;
  accountName: string;
  mobileNumber: string;
  qrImageUrl?: string | null;
  instructions?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Keep the server HTML and the browser's first render identical. Reading
  // Date.now() during initialization can cross a second boundary before
  // hydration and produce different countdown text.
  const [now, setNow] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(Boolean(props.submittedAt));
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining =
    now === null
      ? null
      : Math.max(0, new Date(props.expiresAt).getTime() - now);
  const countdown = useMemo(
    () =>
      remaining === null
        ? "--:--"
        : `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}`,
    [remaining],
  );

  if (submitted) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
        <p className="font-semibold">Payment awaiting verification</p>
        <p className="mt-1 text-sm text-amber-800">
          The salon has up to four hours to review your payment. Your
          appointment is not confirmed until you receive the confirmation SMS.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-primary/15 bg-primary/[0.04] p-5 sm:flex-row">
        {props.qrImageUrl ? (
          <div className="w-full max-w-[260px] space-y-2">
            <Image
              src={props.qrImageUrl}
              alt="GCash QR code"
              width={720}
              height={720}
              unoptimized
              priority
              className="aspect-square w-full rounded-2xl border bg-white object-contain p-2 shadow-sm"
            />
            <Button
              asChild
              type="button"
              variant="outline"
              className="h-10 w-full rounded-xl bg-white"
            >
              <a
                href={`/api/public/gcash-qr?businessSlug=${encodeURIComponent(props.businessSlug)}`}
                download
              >
                <Download className="mr-2 size-4" />
                Download QR
              </a>
            </Button>
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Send exactly
          </p>
          <p className="text-2xl font-bold tabular-nums">
            ₱{props.amount.toFixed(2)}
          </p>
          <p className="text-sm font-medium">{props.accountName}</p>
          <p className="font-mono text-sm text-muted-foreground">
            {props.mobileNumber}
          </p>
          {props.instructions ? (
            <p className="pt-1 text-xs text-muted-foreground">
              {props.instructions}
            </p>
          ) : null}
        </div>
      </div>
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Payment window: <strong className="tabular-nums">{countdown}</strong>
      </div>
      <form
        action={(formData) =>
          startTransition(async () => {
            const result = await submitGcashPaymentAction({
              bookingId: props.bookingId,
              businessSlug: props.businessSlug,
              token: props.token,
              payerName: String(formData.get("payerName") || ""),
              reference: String(formData.get("reference") || ""),
            });
            if (!result.success) {
              toast.error(result.error);
              return;
            }
            if (result.duplicateReference)
              toast.warning(
                "That reference was used before. The salon will verify it manually.",
              );
            setSubmitted(true);
            router.refresh();
          })
        }
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="payerName">Payer name (optional)</Label>
            <Input id="payerName" name="payerName" maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference">GCash reference (optional)</Label>
            <Input id="reference" name="reference" maxLength={80} />
          </div>
        </div>
        <Button
          className="h-12 w-full rounded-2xl"
          disabled={pending || remaining === null || remaining === 0}
        >
          {pending
            ? "Notifying salon…"
            : remaining === 0
              ? "Payment window expired"
              : "I’ve paid — notify the salon"}
        </Button>
      </form>
    </div>
  );
}
