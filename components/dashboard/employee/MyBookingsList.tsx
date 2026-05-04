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
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300";
    case "COMPLETED":
      return "border-primary/30 bg-primary/10 text-primary";
    case "CANCELLED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
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
      <div className="px-4 py-6 text-xs text-muted-foreground text-center">
        No bookings assigned to you yet.
      </div>
    );
  }

  return (
    <>
      <ol className="divide-y divide-border">
        {bookings.map((booking) => {
          const when = booking.scheduled_at ?? booking.created_at;
          return (
            <li key={booking.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(booking);
                  setOpen(true);
                }}
                className="w-full px-4 py-3 hover:bg-accent/50 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {getBookingCustomerName(booking)}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3 shrink-0" />
                    <span className="shrink-0">{formatPH(when, "MMM d, h:mm a")}</span>
                    <span className="mx-1 shrink-0">·</span>
                    <span className="truncate">
                      {booking.availed_services
                        .map((as) => as.service.name)
                        .join(", ")}
                    </span>
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md shrink-0",
                    statusBadgeClass(booking.status),
                  )}
                >
                  {booking.status}
                </Badge>
              </button>
            </li>
          );
        })}
      </ol>
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
