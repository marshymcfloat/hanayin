import { Suspense } from "react";
import { OwnerBookingsWorkspace } from "@/components/dashboard/owner-preview/OwnerBookingsWorkspace";

export const metadata = { title: "Bookings Preview | ServiceFlow", robots: { index: false, follow: false } };

export default function BookingsPreviewPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  return <Suspense fallback={<div className="min-h-dvh bg-[#F5F6F3]" aria-label="Loading bookings" />}><OwnerBookingsWorkspace params={params} /></Suspense>;
}
