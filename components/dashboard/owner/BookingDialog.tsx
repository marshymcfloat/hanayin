"use client";

import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Plus, X } from "lucide-react";
import BookingForm, {
  PackageWithItems,
} from "@/components/bookings/BookingForm";
import type { Service } from "@/prisma/generated/prisma/client";
import { useState } from "react";
import type { ReactNode } from "react";
import staffTheme from "@/components/dashboard/employee/StaffWorkspaceTheme.module.css";

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
  trigger?: ReactNode;
  onCreated?: () => void;
  presentation?: "default" | "staff";
}

export function BookingDialog({
  services,
  packages = [],
  categories,
  businessSlug,
  allowServiceClaim = true,
  trigger,
  onCreated,
  presentation = "default",
}: BookingDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button
          aria-label="Create new booking"
          size="icon"
          className={presentation === "staff"
            ? "size-11 shrink-0 rounded-full bg-[#20211F] p-0 text-white transition-colors hover:bg-[#30322F] cursor-pointer"
            : "size-10 shrink-0 rounded-full bg-primary p-0 text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-4px_color-mix(in_oklch,var(--primary)_45%,transparent)] transition-all hover:bg-primary/90 active:scale-[0.97] cursor-pointer"}
        >
          <Plus className="size-4" strokeWidth={2.5} />
        </Button>}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className={`${presentation === "staff" ? staffTheme.workspace : ""} h-[90dvh] w-[95vw] max-w-none gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-6xl sm:rounded-3xl sm:border sm:border-black/[0.06]`}>
        <DialogHeader className="sticky top-0 z-20 border-b border-black/[0.06] bg-background/85 px-4 py-3.5 backdrop-blur-sm sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                <CalendarPlus className="size-4" />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  New entry
                </p>
                <DialogTitle className="text-base font-semibold tracking-[-0.01em] sm:text-[17px]">
                  Create new booking
                </DialogTitle>
              </div>
            </div>
            <DialogClose asChild>
              <button type="button" aria-label="Close booking form" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary">
                <X className="size-4" aria-hidden="true" />
              </button>
            </DialogClose>
          </div>
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
            onSuccess={() => {
              setOpen(false);
              onCreated?.();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
