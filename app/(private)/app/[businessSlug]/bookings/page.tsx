import { getBookingsWorkspaceData } from "@/features/bookings/queries/workspace";
import { notFound } from "next/navigation";
import { BookingList } from "@/components/dashboard/owner/BookingList";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { GcashFollowUpQueue, GcashVerificationQueue } from "@/components/dashboard/shared/GcashVerificationQueue";

function BookingsPageSkeleton() {
  return (
    <div className="flex flex-col bg-background">
      <div className="border-b border-border bg-card px-4 sm:px-8 py-5 sm:py-6">
        <div className="max-w-7xl mx-auto w-full flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </div>
      <div className="px-4 sm:px-8 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto w-full space-y-4">
          <div className="flex gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <Skeleton className="h-9 flex-1 max-w-md rounded-xl" />
            <Skeleton className="h-9 w-32 rounded-xl" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<BookingsPageSkeleton />}>
      <BookingsContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function BookingsContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const [{ businessSlug }, query] = await Promise.all([params, searchParams]);
  const data = await getBookingsWorkspaceData(businessSlug, query);
  if (!data) notFound();
  const { status, searchTerm, currentPage, bookings, services, staffingConflictBookingIds, initialOpenBookingId, totalBookings, verificationItems, followUpItems, pageSize } = data;

  return (
    <>
    <div className="px-4 pt-5 sm:px-8">
      <GcashVerificationQueue businessSlug={businessSlug} items={verificationItems} />
      <GcashFollowUpQueue businessSlug={businessSlug} items={followUpItems} />
    </div>
    <BookingList
      key={`${businessSlug}:${status}:${searchTerm}:${currentPage}`}
      bookings={bookings}
      servicesCatalog={services}
      businessSlug={businessSlug}
      staffingConflictBookingIds={staffingConflictBookingIds}
      initialOpenBookingId={initialOpenBookingId}
      queryState={{
        page: currentPage,
        pageSize,
        total: totalBookings,
        search: searchTerm,
        status: status === "ALL" ? "ALL" : status,
      }}
    />
    </>
  );
}
