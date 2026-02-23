import { prisma } from "@/prisma/prisma";
import { getCachedBusinessBySlug } from "@/lib/data/cached";
import { notFound } from "next/navigation";
import { BookingList } from "@/components/dashboard/owner/BookingList";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatus } from "@/prisma/generated/prisma/enums";
import { requireTenantAccess } from "@/lib/auth/guards";

function BookingsPageSkeleton() {
  return (
    <div className="space-y-4">
      {/* Search and filter skeleton */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-32" />
      </div>
      {/* Table header skeleton */}
      <div className="hidden md:grid md:grid-cols-6 gap-4 p-4 border-b">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
      </div>
      {/* Table rows skeleton */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 border-b"
        >
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      ))}
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
    <div className="min-h-screen flex flex-col p-4 md:p-8 bg-zinc-50/50">
      <section className="flex-1 flex flex-col bg-white overflow-hidden rounded-xl md:rounded-3xl border border-gray-200 shadow-xl p-4 md:p-6">
        <PageHeader
          title="Bookings"
          description="View and manage all your bookings."
          className="mb-6"
        />
        <Suspense fallback={<BookingsPageSkeleton />}>
          <BookingsContent params={params} searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}

const PAGE_SIZE = 50;
const ALLOWED_STATUS = new Set<BookingStatus>([
  BookingStatus.HOLD,
  BookingStatus.ACCEPTED,
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
]);

async function BookingsContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const [{ businessSlug }, query] = await Promise.all([params, searchParams]);
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) {
    return notFound();
  }

  const business = await getCachedBusinessBySlug(businessSlug);

  if (!business) {
    return notFound();
  }

  const rawSearch = query.q;
  const rawStatus = query.status;
  const rawPage = query.page;

  const searchTerm =
    typeof rawSearch === "string" ? rawSearch.trim() : "";
  const requestedStatus = typeof rawStatus === "string" ? rawStatus : "ALL";
  const status =
    requestedStatus === "ALL"
      ? "ALL"
      : ALLOWED_STATUS.has(requestedStatus as BookingStatus)
        ? (requestedStatus as BookingStatus)
        : "ALL";

  const pageValue =
    typeof rawPage === "string" ? Number.parseInt(rawPage, 10) : 1;
  const currentPage =
    Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const skip = (currentPage - 1) * PAGE_SIZE;

  const parsedId = Number.parseInt(searchTerm, 10);
  const hasIdSearch = Number.isInteger(parsedId);

  const whereClause = {
    where: {
      business_id: business.id,
      ...(status === "ALL" ? {} : { status }),
      ...(searchTerm.length === 0
        ? {}
        : {
            OR: [
              {
                customer: {
                  name: {
                    contains: searchTerm,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                customer: {
                  phone: {
                    contains: searchTerm,
                  },
                },
              },
              ...(hasIdSearch ? [{ id: parsedId }] : []),
            ],
          }),
    },
  };

  const [totalBookings, bookings] = await prisma.$transaction([
    prisma.booking.count(whereClause),
    prisma.booking.findMany({
      ...whereClause,
      skip,
      take: PAGE_SIZE,
      include: {
        customer: true,
        availed_services: {
          include: {
            service: true,
            served_by: {
              include: { user: true },
            },
            served_by_owner: {
              include: { user: true },
            },
          },
        },
        vouchers: true,
      },
      orderBy: {
        created_at: "desc",
      },
    }),
  ]);

  const services = await prisma.service.findMany({
    where: {
      business_id: business.id,
    },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      duration: true,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const recentConflictSignals = bookings.length
    ? await prisma.outboxMessage.findMany({
        where: {
          business_id: business.id,
          event_type: "BOOKING_STAFFING_CONFLICT_DETECTED",
          aggregate_id: {
            in: bookings.map((booking) => String(booking.id)),
          },
        },
        select: {
          aggregate_id: true,
        },
      })
    : [];

  const staffingConflictBookingIds = recentConflictSignals
    .map((signal) => Number.parseInt(signal.aggregate_id, 10))
    .filter(Number.isFinite);

  return (
    <BookingList
      key={`${businessSlug}:${status}:${searchTerm}:${currentPage}`}
      bookings={bookings}
      servicesCatalog={services}
      businessSlug={businessSlug}
      staffingConflictBookingIds={staffingConflictBookingIds}
      queryState={{
        page: currentPage,
        pageSize: PAGE_SIZE,
        total: totalBookings,
        search: searchTerm,
        status: status === "ALL" ? "ALL" : status,
      }}
    />
  );
}
