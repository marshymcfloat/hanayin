"use client";

import Link from "next/link";
import { formatPH } from "@/lib/date-utils";
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
import { ArrowRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
import { BOOKING_PAYMENT_STAGE_LABELS, deriveBookingPaymentStage, type BookingPaymentStage } from "@/lib/utils/booking-payment-stage";

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

export function RecentBookingsWidget({
  bookings,
  className,
  businessSlug,
  compact = false,
}: RecentBookingsWidgetProps) {
  const recentBookings = [...bookings]
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
    STATUS_STYLES[deriveBookingPaymentStage(booking)];

  const getStatusLabel = (booking: BookingWithDetails) =>
    BOOKING_PAYMENT_STAGE_LABELS[deriveBookingPaymentStage(booking)];

  // ── Compact strip variant (used inside OwnerDashboard center column) ──
  if (compact) {
    return (
      <div className={cn("bg-card", className)}>
        {/* Strip header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
            Recent Bookings
          </p>
          <Link
            href={`/app/${businessSlug}/bookings`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {recentBookings.length === 0 ? (
          <div className="flex items-center justify-center h-12 text-xs text-muted-foreground">
            No bookings today
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {recentBookings.map((booking) => (
              <div
                key={booking.id}
                className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-accent/30 transition-colors"
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
                      "text-[8px] uppercase font-bold tracking-wide px-1.5 py-0.5 rounded border",
                      getStatusStyle(booking),
                    )}
                  >
                    {getStatusLabel(booking)}
                  </span>
                  <span className="text-xs font-bold text-foreground tabular-nums">
                    ₱{booking.grand_total.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Full card variant ──
  return (
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
          <p className="text-xs text-muted-foreground mt-0.5">Latest 5 for today</p>
        </div>
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
      </CardHeader>
      <CardContent className="p-0 overflow-auto flex-1">
        {recentBookings.length > 0 ? (
          <div className="divide-y divide-border/50">
            {recentBookings.map((booking) => (
              <div
                key={booking.id}
                className="px-4 py-3 hover:bg-accent/30 transition-colors flex items-center justify-between gap-3"
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
                      "text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md border",
                      getStatusStyle(booking),
                    )}
                  >
                    {getStatusLabel(booking)}
                  </span>
                  <span className="font-bold text-sm text-foreground tabular-nums">
                    ₱{booking.grand_total.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-center p-6 space-y-2">
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No bookings today yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
