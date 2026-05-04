"use client";

/**
 * Manager-side "Today's Bookings" dialog. Wraps the role-aware
 * BookingList in a Dialog so a manager can pull up the full list from
 * their dashboard header without leaving the page.
 *
 * The list itself is the same one owners use — gated by viewerContext
 * so destructive actions (delete) are hidden for managers, while
 * everything else (search, status filter, view detail, mark paid via
 * the panel, etc.) works the same.
 */

import { useState } from "react";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type {
  AvailedService,
  Booking,
  Customer,
  Employee,
  Owner,
  Service,
  User,
  Voucher,
} from "@/prisma/generated/prisma/client";

import { BookingList } from "@/components/dashboard/owner/BookingList";

type BookingWithDetails = Booking & {
  customer: Customer | null;
  vouchers: Voucher[];
  availed_services: (AvailedService & {
    service: Service;
    served_by: (Employee & { user: User }) | null;
    served_by_owner: (Owner & { user: User }) | null;
  })[];
};

export type ManagerBookingsDialogProps = {
  bookings: BookingWithDetails[];
  servicesCatalog?: {
    id: number;
    name: string;
    category: string;
    price: number;
    duration: number | null;
  }[];
  /** Optional override for the trigger button label/contents. */
  triggerLabel?: string;
};

export function ManagerBookingsDialog({
  bookings,
  servicesCatalog = [],
  triggerLabel = "Today's bookings",
}: ManagerBookingsDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 rounded-xl text-xs"
        >
          <Calendar className="h-3.5 w-3.5" />
          {triggerLabel}
          {bookings.length > 0 ? (
            <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
              {bookings.length}
            </span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Today&apos;s bookings</DialogTitle>
        </DialogHeader>
        <BookingList
          bookings={bookings}
          servicesCatalog={servicesCatalog}
          className="px-0"
        />
      </DialogContent>
    </Dialog>
  );
}
