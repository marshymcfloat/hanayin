"use client";

import { Plus } from "lucide-react";
import type { PackageWithItems } from "@/components/bookings/BookingForm";
import type { Service } from "@/prisma/generated/prisma/client";
import { useOwnerBookingController } from "./OwnerBookingController";

export function OwnerPreviewBookingCreateButton(_props: {
  businessSlug: string;
  services: Service[];
  packages: PackageWithItems[];
  categories: string[];
}) {
  const { openBooking, pending, recoveryAvailable } = useOwnerBookingController();

  return (
    <>
      <button
        type="button"
        data-catalog-focus="owner-new-booking-page"
        onClick={() => openBooking("owner-new-booking-page")}
        disabled={pending}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-[#20211F] px-5 text-sm font-bold text-white outline-none transition-colors hover:bg-[#343633] focus-visible:ring-3 focus-visible:ring-[#72CF35] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {pending ? "Creating booking…" : recoveryAvailable ? "Resume booking" : "New booking"}
      </button>
    </>
  );
}
