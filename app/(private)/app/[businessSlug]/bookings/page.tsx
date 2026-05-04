import { prisma } from "@/prisma/prisma";
import { getCachedBusinessBySlug } from "@/lib/data/cached";
import { notFound } from "next/navigation";
import { BookingList } from "@/components/dashboard/owner/BookingList";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatus } from "@/prisma/generated/prisma/enums";
import { requireTenantAccess } from "@/lib/auth/guards";

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

  // Deep-link support: ?open=<id> auto-opens the BookingQuickPanel.
  // Fed by notification deep-links and any future surface that wants
  // to point a user directly at a booking.
  const rawOpen = query.open;
  const openIdParsed =
    typeof rawOpen === "string" ? Number.parseInt(rawOpen, 10) : NaN;
  const initialOpenBookingId =
    Number.isInteger(openIdParsed) && openIdParsed > 0 ? openIdParsed : null;

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
      initialOpenBookingId={initialOpenBookingId}
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
