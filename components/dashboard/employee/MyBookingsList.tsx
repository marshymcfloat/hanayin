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
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "COMPLETED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "CANCELLED":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
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
      <ol className="divide-y divide-zinc-100">
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
                className="w-full px-4 py-3 hover:bg-zinc-50 flex items-center justify-between gap-3 text-left transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900 truncate">
                    {getBookingCustomerName(booking)}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatPH(when, "MMM d, h:mm a")}
                    <span className="mx-1">·</span>
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
