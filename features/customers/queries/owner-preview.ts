import "server-only";

import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { customerBusinessWhere } from "@/features/customers/customer-access";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { OwnerPreviewCustomerDirectory, OwnerPreviewCustomerHistory } from "@/features/customers/types/owner-preview";
import type { OwnerPreviewCustomerFilters } from "@/features/customers/owner-preview-schemas";

type DirectoryDb = Pick<Prisma.TransactionClient, "business" | "customer" | "booking" | "availedService">;
const pageSize = 25;

export async function getOwnerPreviewCustomers(
  actor: OwnerActorContext,
  filters: OwnerPreviewCustomerFilters,
  db: DirectoryDb = prisma,
): Promise<OwnerPreviewCustomerDirectory | null> {
  const businessWhere = customerBusinessWhere(actor);
  const business = await db.business.findFirst({ where: businessWhere, select: { name: true } });
  if (!business) return null;

  const completedBooking = { business_id: actor.businessId, status: "COMPLETED" as const };
  const base: Prisma.CustomerWhereInput = { business_id: actor.businessId, business: businessWhere };
  const search = filters.search.trim();
  const digits = search.replace(/\D/g, "").replace(/^0/, "");
  const filtered: Prisma.CustomerWhereInput = {
    ...base,
    ...(filters.segment === "new" ? { bookings: { none: completedBooking } }
      : filters.segment === "returning" ? { bookings: { some: completedBooking } } : {}),
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ] } : {}),
  };

  const [customers, filteredCount, totalCustomers, newCustomers, completedVisits] = await Promise.all([
    db.customer.findMany({
      where: filtered,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (filters.page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, email: true, phone: true, created_at: true,
        _count: { select: { bookings: { where: completedBooking } } },
        bookings: { where: completedBooking, orderBy: [{ scheduled_at: "desc" }, { created_at: "desc" }], take: 1, select: { scheduled_at: true, created_at: true } },
      },
    }),
    db.customer.count({ where: filtered }),
    db.customer.count({ where: base }),
    db.customer.count({ where: { ...base, bookings: { none: completedBooking } } }),
    db.booking.count({ where: { ...completedBooking, customer_id: { not: null }, customer: { business_id: actor.businessId, business: businessWhere } } }),
  ]);

  return {
    businessName: business.name,
    page: filters.page,
    pageSize,
    filteredCount,
    totals: { customers: totalCustomers, newCustomers, returningCustomers: totalCustomers - newCustomers, completedVisits },
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      joinedAt: customer.created_at.toISOString(),
      completedVisits: customer._count.bookings,
      lastVisitAt: customer.bookings[0]
        ? (customer.bookings[0].scheduled_at ?? customer.bookings[0].created_at).toISOString()
        : null,
    })),
  };
}

export async function getOwnerPreviewCustomerHistory(
  actor: OwnerActorContext,
  customerId: string,
  db: DirectoryDb = prisma,
): Promise<OwnerPreviewCustomerHistory | null> {
  const businessWhere = customerBusinessWhere(actor);
  const customer = await db.customer.findFirst({
    where: { id: customerId, business_id: actor.businessId, business: businessWhere },
    select: { id: true },
  });
  if (!customer) return null;

  const rows = await db.availedService.findMany({
    where: {
      status: "COMPLETED",
      service: { business_id: actor.businessId },
      booking: {
        business_id: actor.businessId,
        customer_id: customerId,
        status: "COMPLETED",
        business: businessWhere,
        customer: { business_id: actor.businessId },
      },
    },
    orderBy: [{ completed_at: "desc" }, { id: "desc" }],
    take: 21,
    select: {
      id: true, completed_at: true, final_price: true,
      service: { select: { name: true } },
      served_by: { select: { user: { select: { name: true } } } },
      served_by_owner: { select: { user: { select: { name: true } } } },
    },
  });
  return {
    customerId,
    hasMore: rows.length > 20,
    services: rows.slice(0, 20).map((row) => ({
      id: row.id,
      completedAt: row.completed_at?.toISOString() ?? null,
      service: row.service.name,
      provider: row.served_by?.user.name ?? row.served_by_owner?.user.name ?? null,
      amount: row.final_price,
    })),
  };
}
