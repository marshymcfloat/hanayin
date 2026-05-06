"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Plus } from "lucide-react";
import BookingForm, {
  PackageWithItems,
} from "@/components/bookings/BookingForm";
import type { Service } from "@/prisma/generated/prisma/client";
import { useState } from "react";

/* type PackageWithItems = ServicePackage & {
  items: any[]; // Adjust type if strictly needed, but 'any' or specific structure usually works for props passing if strict type isn't exported
};
 */
interface BookingDialogProps {
  services: Service[];
  packages?: PackageWithItems[]; // Using any to avoid complex type import chains if possible, will refine if needed
  categories: string[];
  businessSlug: string;
  allowServiceClaim?: boolean;
}

export function BookingDialog({
  services,
  packages = [],
  categories,
  businessSlug,
  allowServiceClaim = true,
}: BookingDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          aria-label="Create new booking"
          className="h-9 rounded-xl bg-primary px-3 text-primary-foreground font-semibold shadow-sm shadow-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:scale-[0.97] cursor-pointer sm:h-10 sm:px-4"
        >
          <Plus className="h-4 w-4 sm:mr-2" strokeWidth={3} />
          <span className="sr-only font-semibold sm:not-sr-only sm:whitespace-nowrap">
            New Booking
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[90dvh] w-[95vw] max-w-none gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-6xl sm:rounded-2xl sm:border">
        <DialogHeader className="sticky top-0 z-20  border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6 sm:py-4">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <CalendarPlus className="h-4 w-4 text-primary" />
            Create New Booking
          </DialogTitle>
        </DialogHeader>
        <div
          className="max-h-[calc(100dvh-57px)] overflow-y-auto px-4 py-4 sm:max-h-[calc(90vh-64px)] sm:px-8 sm:py-6"
          data-business-slug={businessSlug}
        >
          <BookingForm
            services={services}
            packages={packages}
            categories={categories}
            isEmployee={true}
            allowServiceClaim={allowServiceClaim}
            isModal={true}
            onSuccess={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
