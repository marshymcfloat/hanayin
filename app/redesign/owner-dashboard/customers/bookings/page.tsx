import { Suspense } from "react";
import type { Metadata } from "next";
import { redesignBodyFont } from "@/components/landing/hanaylo/fonts";
import OwnerCustomerWorkspace from "@/components/dashboard/design-study/OwnerCustomerWorkspace";
import { OwnerBookingsLoading } from "@/components/dashboard/design-study/OwnerBookingsLoading";
import { OwnerBookingsWorkspace } from "@/components/dashboard/owner-preview/OwnerBookingsWorkspace";

export const metadata: Metadata = { title: { absolute: "Bookings — HANAYIN" }, description: "Manage customer appointments and review booking payments.", robots: { index: false, follow: false } };

export default function BookingsPage() {
  return <OwnerCustomerWorkspace page="bookings" fontClassName={redesignBodyFont.variable}><Suspense fallback={<OwnerBookingsLoading />}><OwnerBookingsWorkspace redesign fontClassName={redesignBodyFont.variable} /></Suspense></OwnerCustomerWorkspace>;
}
