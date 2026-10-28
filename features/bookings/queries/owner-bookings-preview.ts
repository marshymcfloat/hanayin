import "server-only";

import type { OwnerActorContext } from "@/lib/auth/owner-access";
import { getBookingCustomerName } from "@/lib/utils/booking-customer";
import { deriveBookingPaymentStage } from "@/lib/utils/booking-payment-stage";
import { bookingPreviewDayBounds, type BookingPreviewFilters } from "@/features/bookings/owner-bookings-preview-schemas";
import type { OwnerBookingList, OwnerBookingPreviewItem, OwnerBookingSummary } from "@/features/bookings/types/owner-bookings-preview";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

type PreviewDb = Pick<Prisma.TransactionClient, "business" | "booking" | "bookingPayment">;
const PAGE_SIZE = 25;

function membership(actor: OwnerActorContext) {
  return { id: actor.ownerId, business_id: actor.businessId, user_id: actor.userId, user: { role: Role.OWNER } };
}

async function authorizedBusiness(actor: OwnerActorContext, db: PreviewDb) {
  return db.business.findFirst({
    where: { id: actor.businessId, slug: actor.businessSlug, owners: { some: membership(actor) } },
    select: { id: true },
  });
}

function tenantBookingWhere(actor: OwnerActorContext): Prisma.BookingWhereInput {
  return {
    business_id: actor.businessId,
    business: { slug: actor.businessSlug, owners: { some: membership(actor) } },
  };
}

function paymentWhere(actor: OwnerActorContext): Prisma.BookingPaymentWhereInput {
  return {
    status: "PENDING",
    payment_method: "GCASH",
    submitted_at: { not: null },
    booking: { ...tenantBookingWhere(actor), status: "HOLD" },
  };
}

const bookingSelect = {
  id: true, status: true, payment_status: true, payment_method: true,
  is_anonymous_walk_in: true, customer_label: true,
  customer: { select: { name: true } },
  scheduled_at: true, estimated_end: true, grand_total: true, amount_paid: true,
  availed_services: { select: {
    service: { select: { name: true } },
    served_by: { select: { user: { select: { name: true } } } },
    served_by_owner: { select: { user: { select: { name: true } } } },
  } },
  payments: { where: { status: "PENDING" }, orderBy: { created_at: "desc" as const }, take: 1, select: { status: true, submitted_at: true, escalated_at: true } },
} satisfies Prisma.BookingSelect;

type SelectedBooking = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

function toItem(booking: SelectedBooking): OwnerBookingPreviewItem {
  return {
    id: booking.id,
    status: booking.status,
    paymentStage: deriveBookingPaymentStage(booking),
    paymentStatus: booking.payment_status,
    paymentMethod: booking.payment_method,
    customerName: getBookingCustomerName(booking),
    scheduledAt: booking.scheduled_at?.toISOString() ?? null,
    estimatedEnd: booking.estimated_end?.toISOString() ?? null,
    services: booking.availed_services.map((item) => item.service.name),
    providers: [...new Set(booking.availed_services.flatMap((item) => [item.served_by?.user.name, item.served_by_owner?.user.name].filter((name): name is string => !!name)))],
    total: booking.grand_total,
    paid: booking.amount_paid,
  };
}

export async function getOwnerBookingsPreviewList(actor: OwnerActorContext, filters: BookingPreviewFilters, db: PreviewDb = prisma): Promise<OwnerBookingList | null> {
  if (!await authorizedBusiness(actor, db)) return null;
  const where: Prisma.BookingWhereInput = {
    ...tenantBookingWhere(actor),
    ...(filters.date ? { scheduled_at: bookingPreviewDayBounds(filters.date) } : {}),
    ...(filters.status === "ALL" ? {} : { status: filters.status }),
    ...(filters.q ? { OR: [
      { customer: { name: { contains: filters.q, mode: "insensitive" } } },
      { customer_label: { contains: filters.q, mode: "insensitive" } },
      { availed_services: { some: { service: { name: { contains: filters.q, mode: "insensitive" } } } } },
      ...(Number.isSafeInteger(Number(filters.q)) && /^\d+$/.test(filters.q) ? [{ id: Number(filters.q) }] : []),
    ] } : {}),
  };
  const [totalCount, bookings] = await Promise.all([
    db.booking.count({ where }),
    db.booking.findMany({ where, select: bookingSelect, orderBy: filters.date ? [{ scheduled_at: "asc" }, { id: "asc" }] : [{ scheduled_at: "desc" }, { id: "desc" }], skip: (filters.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return { bookings: bookings.map(toItem), totalCount, page: filters.page, pageSize: PAGE_SIZE, totalPages: Math.ceil(totalCount / PAGE_SIZE) };
}

export async function getOwnerBookingsPreviewSummary(actor: OwnerActorContext, date: string, db: PreviewDb = prisma): Promise<OwnerBookingSummary | null> {
  if (!await authorizedBusiness(actor, db)) return null;
  const dateWhere: Prisma.BookingWhereInput = { ...tenantBookingWhere(actor), scheduled_at: bookingPreviewDayBounds(date) };
  const openWhere: Prisma.BookingWhereInput = { ...dateWhere, status: { in: ["HOLD", "ACCEPTED"] } };
  const pendingWhere = paymentWhere(actor);
  const [totalBookings, acceptedCount, holdCount, received, open, pendingGcashCount, pendingPayment] = await Promise.all([
    db.booking.count({ where: dateWhere }),
    db.booking.count({ where: { ...dateWhere, status: "ACCEPTED" } }),
    db.booking.count({ where: { ...dateWhere, status: "HOLD" } }),
    db.booking.aggregate({ where: { ...dateWhere, status: { not: "CANCELLED" } }, _sum: { amount_paid: true } }),
    db.booking.aggregate({ where: openWhere, _sum: { grand_total: true, amount_paid: true } }),
    db.bookingPayment.count({ where: pendingWhere }),
    db.bookingPayment.findFirst({ where: pendingWhere, orderBy: { submitted_at: "asc" }, select: {
      amount_principal: true, escalated_at: true,
      booking: { select: { id: true, scheduled_at: true, customer: { select: { name: true } }, customer_label: true, is_anonymous_walk_in: true, availed_services: { select: { service: { select: { name: true } } } } } },
    } }),
  ]);
  return {
    date, totalBookings, acceptedCount, holdCount,
    amountReceived: received._sum.amount_paid ?? 0,
    openBalance: Math.max(0, (open._sum.grand_total ?? 0) - (open._sum.amount_paid ?? 0)),
    pendingGcashCount,
    pendingGcash: pendingPayment ? {
      bookingId: pendingPayment.booking.id,
      customerName: getBookingCustomerName(pendingPayment.booking),
      scheduledAt: pendingPayment.booking.scheduled_at?.toISOString() ?? null,
      services: pendingPayment.booking.availed_services.map((item) => item.service.name),
      amount: pendingPayment.amount_principal,
      escalated: !!pendingPayment.escalated_at,
    } : null,
  };
}
