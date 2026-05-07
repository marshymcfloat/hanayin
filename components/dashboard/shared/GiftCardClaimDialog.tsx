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
          size="icon"
          className="size-10 shrink-0 rounded-full border-black/[0.08] bg-card p-0 text-foreground/70 transition-colors hover:bg-primary/[0.06] hover:text-primary hover:border-primary/30 cursor-pointer"
        >
          <Gift className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[90dvh] w-[95vw] max-w-none gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-2xl sm:border">
        <DialogHeader className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6 sm:py-4">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Gift className="h-4 w-4 text-primary" />
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

