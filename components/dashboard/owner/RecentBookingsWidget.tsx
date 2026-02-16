"use client";

import Link from "next/link";
import { formatPH } from "@/lib/date-utils";
import {
  Booking,
  Customer,
  BookingStatus,
  AvailedService,
  Service,
  Employee,
  User,
  Voucher,
  Owner,
} from "@/prisma/generated/prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type BookingWithDetails = Booking & {
  customer: Customer;
  vouchers: Voucher[];
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
}

export function RecentBookingsWidget({
  bookings,
  className,
  businessSlug,
}: RecentBookingsWidgetProps) {
  // Sort by created_at desc (just in case) and take top 5
  const recentBookings = [...bookings]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 5);

  const getStatusColor = (status: BookingStatus) => {
    switch (status) {
      case "ACCEPTED":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "COMPLETED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "CANCELLED":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-zinc-100 text-zinc-700 border-zinc-200";
    }
  };

  const getDisplayTime = (booking: BookingWithDetails) => {
    const date = booking.scheduled_at ?? booking.created_at;
    return formatPH(date, "h:mm a");
  };

  return (
    <Card
      className={cn(
        "flex flex-col h-full overflow-hidden border-none shadow-xl shadow-zinc-200/50 bg-white rounded-[24px]",
        className,
      )}
    >
      <CardHeader className="px-6 pt-6 pb-2 border-b border-zinc-50 flex flex-row items-center justify-between sticky top-0 bg-white z-10">
        <div className="space-y-1">
          <CardTitle className="text-xl font-bold tracking-tight text-zinc-900">
            Recent Bookings
          </CardTitle>
          <p className="text-xs font-medium text-zinc-500">
            Latest 5 for today
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 gap-1 pr-2"
          asChild
        >
          <Link href={`/app/${businessSlug}/bookings`}>
            View All
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0 overflow-auto flex-1">
        {recentBookings.length > 0 ? (
          <div className="divide-y divide-zinc-50">
            {recentBookings.map((booking) => (
              <div
                key={booking.id}
                className="p-4 hover:bg-zinc-50/50 transition-colors group flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-sm ring-2 ring-white shadow-sm">
                    {booking.customer.name.charAt(0)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-sm text-zinc-900 truncate">
                      {booking.customer.name}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getDisplayTime(booking)}
                      </span>
                      <span className="text-zinc-300">•</span>
                      <span>#{booking.id}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md border shadow-sm",
                      getStatusColor(booking.status),
                    )}
                  >
                    {booking.status}
                  </Badge>
                  <span className="font-bold text-sm text-zinc-900">
                    ₱{booking.grand_total.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center p-6 space-y-3">
            <div className="h-10 w-10 rounded-full bg-zinc-50 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-zinc-300" />
            </div>
            <p className="text-sm font-medium text-zinc-500">
              No bookings today yet.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
