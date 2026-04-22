"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import GiftCardClaimForm from "@/components/bookings/GiftCardClaimForm";

interface GiftCardClaimDialogProps {
  businessSlug: string;
}

export function GiftCardClaimDialog({ businessSlug }: GiftCardClaimDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          aria-label="Claim gift card booking"
          variant="outline"
          className="h-9 rounded-xl border border-violet-200 bg-violet-50 px-3 text-violet-700 font-semibold shadow-sm transition-all duration-200 hover:bg-violet-100 hover:text-violet-700 hover:border-violet-300 hover:shadow-md hover:shadow-violet-200/60 active:scale-[0.97] cursor-pointer sm:h-10 sm:px-4"
        >
          <Gift className="h-4 w-4 sm:mr-2" />
          <span className="sr-only font-semibold sm:not-sr-only sm:whitespace-nowrap">
            Claim Gift Card
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[90dvh] w-[95vw] max-w-none gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-2xl sm:border">
        <DialogHeader className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6 sm:py-4">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Gift className="h-4 w-4 text-violet-600" />
            Claim Gift Card Booking
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[calc(100dvh-57px)] overflow-y-auto px-3 py-3 sm:max-h-[calc(90vh-64px)] sm:px-6 sm:py-5">
          <GiftCardClaimForm
            businessSlug={businessSlug}
            mode="staff"
            onSuccess={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

