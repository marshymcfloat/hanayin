"use client";

/**
 * MyBookingsList — compact list shown to STAFF (and any non-manager
 * employee) of bookings where they're the assigned staff on at least
 * one service line. Each row opens the role-aware BookingQuickPanel
 * with the staff member's viewer context, so they see only the
 * actions their permissions allow (typically read-mostly + record
 * payment if PAYMENT_COLLECT is granted).
 */

import { useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import {
  BookingQuickPanel,
  deriveBookingViewerContext,
} from "@/components/bookings/BookingQuickPanel";
import { useViewer } from "@/lib/auth/viewer-context";
import { formatPH } from "@/lib/date-utils";
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  AvailedService,
  Booking,
  BookingStatus,
  Customer,
  Employee,
  Owner,
  Service,
  User,
  Voucher,
} from "@/prisma/generated/prisma/client";

type BookingWithDetails = Booking & {
  customer: Customer | null;
  vouchers: Voucher[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: (Employee & { user: User }) | null;
    served_by_owner: (Owner & { user: User }) | null;
  })[];
};

export type MyBookingsListProps = {
  bookings: BookingWithDetails[];
  servicesCatalog?: {
    id: number;
    name: string;
    category: string;
    price: number;
    duration: number | null;
  }[];
};

const statusBadgeClass = (status: BookingStatus) => {
  switch (status) {
    case "ACCEPTED":
      // Was blue (drift). Move to primary tints so the portal stays
      // on the green-shades palette.
      return "border-primary/30 bg-primary/10 text-primary";
    case "COMPLETED":
      return "border-primary/30 bg-primary/10 text-primary";
    case "CANCELLED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      // HOLD / pending — amber stays. It's universally understood as
      // "needs attention" and the green palette can't carry both
      // "in progress" and "needs attention" without losing meaning.
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
  }
};

export function MyBookingsList({
  bookings,
  servicesCatalog = [],
}: MyBookingsListProps) {
  const viewer = useViewer();
  const viewerContext = useMemo(
    () => deriveBookingViewerContext(viewer),
    [viewer],
  );
  const [selected, setSelected] = useState<BookingWithDetails | null>(null);
  const [open, setOpen] = useState(false);

  if (bookings.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-12 text-center space-y-3">
        <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
          <Calendar className="size-5" />
        </div>
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">
            No bookings yet
          </h3>
          <p className="text-xs text-muted-foreground">
            Bookings assigned to you will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ul className="-mx-2 divide-y divide-border">
        {bookings.map((booking) => {
          const when = booking.scheduled_at ?? booking.created_at;
          const customerName = getBookingCustomerName(booking);
          const initials = customerName
            .split(" ")
            .map((n) => n[0])
            .filter(Boolean)
            .join("")
            .toUpperCase()
            .slice(0, 2);
          return (
            <li key={booking.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(booking);
                  setOpen(true);
                }}
                className="group flex w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-inset ring-primary/15">
                    {initials || "?"}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {customerName}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="size-3 shrink-0" />
                      <span className="shrink-0">
                        {formatPH(when, "MMM d, h:mm a")}
                      </span>
                      <span className="mx-1 shrink-0">·</span>
                      <span className="truncate">
                        {booking.availed_services
                          .map((as) => as.service.name)
                          .join(", ")}
                      </span>
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    statusBadgeClass(booking.status),
                  )}
                >
                  {booking.status}
                </Badge>
              </button>
            </li>
          );
        })}
      </ul>
      <BookingQuickPanel
        booking={selected}
        servicesCatalog={servicesCatalog}
        open={open}
        onOpenChange={setOpen}
        viewerContext={viewerContext}
      />
    </>
  );
}
