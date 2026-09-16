import { prisma } from "@/prisma/prisma";
import { getCachedBusinessBySlug } from "@/lib/data/cached";
import { BookingStatus } from "@/prisma/generated/prisma/enums";
import { requireTenantAccess } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { getGcashVerificationQueueAction } from "@/features/payments/actions/manual-gcash";

const PAGE_SIZE = 50;
const ALLOWED_STATUS = new Set<BookingStatus>([
  BookingStatus.HOLD,
  BookingStatus.ACCEPTED,
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
]);

export async function getBookingsWorkspaceData(businessSlug: string, query: Record<string, string | string[] | undefined>) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) {
    return null;
  }

  const business = await getCachedBusinessBySlug(businessSlug);

  if (!business) {
    return null;
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

  const actor = await resolveTenantActorContext(businessSlug, auth.session.user.id);
  const canVerify = actor.success && actor.actorType === "OWNER";
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
        payments: {
          orderBy: { created_at: "desc" },
          take: 1,
          include: { verified_by: { select: { name: true } } },
        },
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

  const verificationData = canVerify
    ? await getGcashVerificationQueueAction(businessSlug)
    : null;
  const verificationItems = verificationData?.success
    ? verificationData.verificationItems
    : [];
  const followUpItems = verificationData?.success
    ? verificationData.followUpItems
    : [];

  return { status, searchTerm, currentPage, bookings, services, staffingConflictBookingIds, initialOpenBookingId, totalBookings, verificationItems, followUpItems, pageSize: PAGE_SIZE };
}
