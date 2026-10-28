"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Gift, X } from "lucide-react";

import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import GiftCardClaimForm from "@/components/bookings/GiftCardClaimForm";
import staffTheme from "@/components/dashboard/employee/StaffWorkspaceTheme.module.css";

interface GiftCardClaimDialogProps {
  businessSlug: string;
  trigger?: ReactNode;
  onClaimed?: () => void;
  presentation?: "default" | "staff";
}

export function GiftCardClaimDialog({ businessSlug, trigger, onClaimed, presentation = "default" }: GiftCardClaimDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button
          aria-label="Claim gift card booking"
          variant="outline"
          size="icon"
          className={`${presentation === "staff" ? "size-11 border-[#E7E9E4] bg-white text-[#20211F] hover:border-[#72CF35] hover:bg-[#EFF9E8]" : "size-10 border-black/[0.08] bg-card text-foreground/70 hover:bg-primary/[0.06] hover:text-primary hover:border-primary/30"} shrink-0 rounded-full p-0 transition-colors cursor-pointer`}
        >
          <Gift className="size-4" />
        </Button>}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className={`${presentation === "staff" ? staffTheme.workspace : ""} h-[90dvh] w-[95vw] max-w-none gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-2xl sm:border`}>
        <DialogHeader className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Gift className="h-4 w-4 text-primary" />
              Claim Gift Card Booking
            </DialogTitle>
            <DialogClose asChild>
              <button type="button" aria-label="Close gift card claim" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary">
                <X className="size-4" aria-hidden="true" />
              </button>
            </DialogClose>
          </div>
        </DialogHeader>
        <div className="max-h-[calc(100dvh-57px)] overflow-y-auto px-3 py-3 sm:max-h-[calc(90vh-64px)] sm:px-6 sm:py-5">
          <GiftCardClaimForm
            businessSlug={businessSlug}
            mode="staff"
            onSuccess={() => {
              setOpen(false);
              if (onClaimed) onClaimed();
              else router.refresh();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
