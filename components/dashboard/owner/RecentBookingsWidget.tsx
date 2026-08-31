"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatPH, getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import {
  Booking,
  Customer,
  AvailedService,
  Service,
  Employee,
  User,
  Voucher,
  Owner,
  BookingPayment,
} from "@/prisma/generated/prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
import {
  BOOKING_PAYMENT_STAGE_LABELS,
  deriveBookingPaymentStage,
  type BookingPaymentStage,
} from "@/lib/utils/booking-payment-stage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { approveGcashPaymentAction } from "@/lib/server actions/manual-gcash";

type BookingWithDetails = Booking & {
  // customer can be null on anonymous walk-ins. The widget falls back to the
  // customer_label via getBookingCustomerName.
  customer: Customer | null;
  vouchers: Voucher[];
  payments?: BookingPayment[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: (Employee & { user: User }) | null;
    served_by_owner: (Owner & { user: User }) | null;
  })[];
};

interface RecentBookingsWidgetProps {
  bookings: BookingWithDetails[];
  className?: string;
  businessSlug: string;
  compact?: boolean;
}

const STATUS_STYLES: Record<BookingPaymentStage, string> = {
  AWAITING_PAYMENT: "bg-amber-50 text-amber-700 border-amber-200",
  AWAITING_VERIFICATION: "bg-amber-50 text-amber-800 border-amber-300",
  NEEDS_RESOLUTION: "bg-orange-50 text-orange-800 border-orange-300",
  CONFIRMED: "bg-blue-50 text-blue-700 border-blue-200",
  COMPLETED: "bg-primary/10 text-primary border-primary/20",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  EXPIRED: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
};

function getPaymentDeadline(booking: BookingWithDetails) {
  return booking.hold_expires_at ?? booking.payments?.[0]?.expires_at ?? null;
}

function getEffectivePaymentStage(
  booking: BookingWithDetails,
  currentTime: number,
): BookingPaymentStage {
  const stage = deriveBookingPaymentStage(booking);
  const deadline = getPaymentDeadline(booking);

  if (
    stage === "AWAITING_PAYMENT" &&
    deadline &&
    new Date(deadline).getTime() <= currentTime
  ) {
    return "EXPIRED";
  }

  return stage;
}

function formatCountdown(deadline: Date | string, currentTime: number) {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(deadline).getTime() - currentTime) / 1000),
  );
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function RecentBookingQuickModal({
  booking,
  businessSlug,
  open,
  onOpenChange,
  currentTime,
}: {
  booking: BookingWithDetails | null;
  businessSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTime: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!booking) return null;

  const payment = booking.payments?.[0];
  const stage = getEffectivePaymentStage(booking, currentTime);
  const deadline = getPaymentDeadline(booking);
  const isUnexpired = !!deadline && new Date(deadline).getTime() > currentTime;
  const canConfirm =
    booking.status === "HOLD" &&
    payment?.status === "PENDING" &&
    isUnexpired &&
    (stage === "AWAITING_PAYMENT" || stage === "AWAITING_VERIFICATION");
  const scheduledAt = booking.scheduled_at ?? booking.created_at;

  const confirmPayment = () => {
    if (!payment || !canConfirm) return;
    startTransition(async () => {
      const result = await approveGcashPaymentAction({
        paymentId: payment.id,
        businessSlug,
        source: payment.submitted_at
          ? "CUSTOMER_SUBMITTED"
          : "OWNER_VERIFIED_WITHOUT_SUBMISSION",
        attestation: {
          transactionFound: true,
          recipientMatched: true,
          amountMatched: true,
          detailsReviewed: true,
        },
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Payment confirmed. The booking is now accepted.");
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl p-0 sm:max-w-md">
        <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12 text-left">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                STATUS_STYLES[stage],
              )}
            >
              {stage === "AWAITING_PAYMENT" && deadline
                ? `Awaiting payment \u00b7 ${formatCountdown(deadline, currentTime)}`
                : BOOKING_PAYMENT_STAGE_LABELS[stage]}
            </span>
            <span className="text-xs text-muted-foreground">
              Booking #{booking.id}
            </span>
          </div>
          <DialogTitle className="pt-1 text-xl">
            {getBookingCustomerName(booking)}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            {formatPH(scheduledAt, "MMM d, yyyy")}
            <span aria-hidden="true">·</span>
            <Clock className="size-3.5" />
            {formatPH(scheduledAt, "h:mm a")}
          </DialogDescription>
          {booking.customer?.phone ? (
            <a
              href={`tel:${booking.customer.phone}`}
              className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Phone className="size-3.5" />
              {booking.customer.phone}
            </a>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="size-3.5" />
              No customer phone number
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 px-5 py-1">
          <section className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Services
            </p>
            <div className="divide-y rounded-2xl border bg-muted/20 px-3">
              {booking.availed_services.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">
                    {item.service.name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    ₱{item.price.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <dl className="grid grid-cols-2 gap-3 rounded-2xl border bg-muted/20 p-4 text-xs">
            <div>
              <dt className="text-muted-foreground">Booking total</dt>
              <dd className="mt-0.5 font-bold tabular-nums">
                ₱{booking.grand_total.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Expected deposit</dt>
              <dd className="mt-0.5 font-bold tabular-nums text-primary">
                {payment
                  ? `₱${payment.amount_principal.toLocaleString()}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Payer</dt>
              <dd className="mt-0.5 font-medium">
                {payment?.payer_name || "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reference</dt>
              <dd className="mt-0.5 break-all font-mono font-medium">
                {payment?.provider_reference || "Not provided"}
              </dd>
            </div>
            {deadline ? (
              <div className="col-span-2 border-t pt-3">
                <dt className="text-muted-foreground">
                  {stage === "AWAITING_PAYMENT"
                    ? "Payment deadline"
                    : "Review deadline"}
                </dt>
                <dd className="mt-0.5 font-medium">
                  {formatPH(deadline, "MMM d, h:mm a")}
                </dd>
                {stage === "AWAITING_PAYMENT" ? (
                  <dd
                    className="mt-1 font-mono font-semibold tabular-nums text-amber-700"
                    aria-label={`Payment expires in ${formatCountdown(deadline, currentTime)}`}
                    aria-live="off"
                  >
                    Expires in {formatCountdown(deadline, currentTime)}
                  </dd>
                ) : null}
              </div>
            ) : null}
          </dl>

          {canConfirm ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
              Confirm only after finding this transaction in the salon&apos;s
              GCash history and matching the recipient and exact amount.
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t px-5 py-4 sm:items-center sm:justify-between">
          <Button variant="ghost" asChild className="sm:mr-auto">
            <Link href={`/app/${businessSlug}/bookings?open=${booking.id}`}>
              View full booking
            </Link>
          </Button>
          {canConfirm ? (
            <Button onClick={confirmPayment} disabled={pending}>
              {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 size-4" />
              )}
              {pending ? "Confirming…" : "Confirm GCash payment"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecentBookingsWidget({
  bookings,
  className,
  businessSlug,
  compact = false,
}: RecentBookingsWidgetProps) {
  const router = useRouter();
  const [refreshing, startRefreshTransition] = useTransition();
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    null,
  );
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const refreshedExpiredBookings = useRef(new Set<number>());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const newlyExpired = bookings.some((booking) => {
      if (deriveBookingPaymentStage(booking) !== "AWAITING_PAYMENT") {
        return false;
      }
      const deadline = getPaymentDeadline(booking);
      if (!deadline || new Date(deadline).getTime() > currentTime) return false;
      if (refreshedExpiredBookings.current.has(booking.id)) return false;
      refreshedExpiredBookings.current.add(booking.id);
      return true;
    });

    if (newlyExpired) router.refresh();
  }, [bookings, currentTime, router]);

  const refreshBookings = () => {
    startRefreshTransition(() => router.refresh());
  };
  const selectedBooking =
    bookings.find((booking) => booking.id === selectedBookingId) ?? null;
  const startOfToday = getStartOfDayPH(new Date(currentTime)).getTime();
  const endOfToday = getEndOfDayPH(new Date(currentTime)).getTime();
  const recentBookings = bookings
    .filter((booking) => {
      const createdAt = new Date(booking.created_at).getTime();
      return createdAt >= startOfToday && createdAt <= endOfToday;
    })
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, compact ? 4 : 5);

  const getDisplayTime = (booking: BookingWithDetails) => {
    const date = booking.scheduled_at ?? booking.created_at;
    return formatPH(date, "h:mm a");
  };

  const getStatusStyle = (booking: BookingWithDetails) =>
    STATUS_STYLES[getEffectivePaymentStage(booking, currentTime)];

  const getStatusLabel = (booking: BookingWithDetails) => {
    const stage = getEffectivePaymentStage(booking, currentTime);
    const deadline = getPaymentDeadline(booking);
    if (stage === "AWAITING_PAYMENT" && deadline) {
      return `Awaiting payment \u00b7 ${formatCountdown(deadline, currentTime)}`;
    }
    return BOOKING_PAYMENT_STAGE_LABELS[stage];
  };

  // ── Compact strip variant (used inside OwnerDashboard center column) ──
  if (compact) {
    return (
      <>
        <div className={cn("bg-card", className)}>
          {/* Strip header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
              Recent Bookings
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={refreshBookings}
                disabled={refreshing}
                aria-label={
                  refreshing
                    ? "Refreshing recent bookings"
                    : "Refresh recent bookings"
                }
                className="size-7 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <RefreshCw
                  className={cn("size-3.5", refreshing && "animate-spin")}
                />
              </Button>
              <Link
                href={`/app/${businessSlug}/bookings`}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
          {recentBookings.length === 0 ? (
            <div className="flex items-center justify-center h-12 text-xs text-muted-foreground">
              No bookings today
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {recentBookings.map((booking) => (
                <button
                  type="button"
                  key={booking.id}
                  onClick={() => setSelectedBookingId(booking.id)}
                  aria-label={`Open booking ${booking.id} for ${getBookingCustomerName(booking)}`}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-accent/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[9px]">
                      {getBookingCustomerName(booking).charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate leading-tight">
                        {getBookingCustomerName(booking)}
                      </p>
                      <p className="text-[9px] text-muted-foreground tabular-nums">
                        #{booking.id} · {getDisplayTime(booking)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "whitespace-nowrap text-[8px] uppercase font-bold tracking-wide px-1.5 py-0.5 rounded border tabular-nums",
                        getStatusStyle(booking),
                      )}
                    >
                      {getStatusLabel(booking)}
                    </span>
                    <span className="text-xs font-bold text-foreground tabular-nums">
                      ₱{booking.grand_total.toLocaleString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <RecentBookingQuickModal
          booking={selectedBooking}
          businessSlug={businessSlug}
          open={selectedBookingId !== null}
          onOpenChange={(next) => !next && setSelectedBookingId(null)}
          currentTime={currentTime}
        />
      </>
    );
  }

  // ── Full card variant ──
  return (
    <>
      <Card
        className={cn(
          "flex flex-col h-full overflow-hidden bg-card rounded-2xl border border-border shadow-sm",
          className,
        )}
      >
        <CardHeader className="px-4 pt-4 pb-2 border-b border-border flex flex-row items-center justify-between sticky top-0 bg-card z-10">
          <div>
            <CardTitle className="text-base font-bold tracking-tight text-foreground">
              Recent Bookings
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Latest 5 for today
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={refreshBookings}
              disabled={refreshing}
              className="h-7 min-w-[82px] cursor-pointer gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              aria-label={
                refreshing
                  ? "Refreshing recent bookings"
                  : "Refresh recent bookings"
              }
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
              />
              {refreshing ? "Refreshing" : "Refresh"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs font-semibold text-primary hover:text-primary hover:bg-primary/8 h-7 gap-1 cursor-pointer"
              asChild
            >
              <Link href={`/app/${businessSlug}/bookings`}>
                View All
                <ArrowRight className="w-3 h-3" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-auto flex-1">
          {recentBookings.length > 0 ? (
            <div className="divide-y divide-border/50">
              {recentBookings.map((booking) => (
                <button
                  type="button"
                  key={booking.id}
                  onClick={() => setSelectedBookingId(booking.id)}
                  aria-label={`Open booking ${booking.id} for ${getBookingCustomerName(booking)}`}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                      {getBookingCustomerName(booking).charAt(0)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-sm text-foreground truncate">
                        {getBookingCustomerName(booking)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {getDisplayTime(booking)} · #{booking.id}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={cn(
                        "whitespace-nowrap text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md border tabular-nums",
                        getStatusStyle(booking),
                      )}
                    >
                      {getStatusLabel(booking)}
                    </span>
                    <span className="font-bold text-sm text-foreground tabular-nums">
                      ₱{booking.grand_total.toLocaleString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-center p-6 space-y-2">
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                No bookings today yet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <RecentBookingQuickModal
        booking={selectedBooking}
        businessSlug={businessSlug}
        open={selectedBookingId !== null}
        onOpenChange={(next) => !next && setSelectedBookingId(null)}
        currentTime={currentTime}
      />
    </>
  );
}
