import "server-only";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { saleEventBusinessWhere, SaleEventError, type SaleEventActorContext } from "@/features/catalog/sale-event-access";
import { saleEventSelect, saleEventPackageSelect } from "@/features/catalog/sale-event-select";
import { serviceCatalogSelect } from "@/features/catalog/service-catalog-select";
import type { CreateSaleEventInput } from "@/features/catalog/sale-event-schemas";

export async function listTenantSaleEvents(context: SaleEventActorContext) {
  return prisma.saleEvent.findMany({
    where: { business_id: context.businessId, business: saleEventBusinessWhere(context) },
    select: { ...saleEventSelect,
      applicable_services: { where: { business_id: context.businessId }, select: serviceCatalogSelect },
      applicable_packages: { where: { business_id: context.businessId }, select: saleEventPackageSelect },
    }, orderBy: { created_at: "desc" },
  });
}
export async function listPublicActiveSaleEvents(businessSlug: string, now = new Date()) {
  return listActiveSaleEvents({ business: { slug: businessSlug } }, now, prisma);
}
export async function listActiveSaleEventsForTenant(businessId: string, db: Pick<Prisma.TransactionClient, "saleEvent">, now = new Date()) {
  return listActiveSaleEvents({ business_id: businessId }, now, db);
}
async function listActiveSaleEvents(tenant: { business?: { slug: string }; business_id?: string }, now: Date, db: Pick<Prisma.TransactionClient, "saleEvent">) {
  const events = await db.saleEvent.findMany({
    where: { ...tenant, start_date: { lte: now }, end_date: { gte: now } },
    select: { ...saleEventSelect,
      applicable_services: { where: tenant, select: { id: true } },
      applicable_packages: { where: tenant, select: { id: true } },
      _count: { select: { bookings: { where: { status: { not: "CANCELLED" }, ...tenant } } } },
    },
  });
  return events.map(({ _count, ...event }) => ({ ...event, slots_remaining: event.slot_limit !== null ? Math.max(0, event.slot_limit - _count.bookings) : null }));
}
export async function getSaleEventCreationContext(context: SaleEventActorContext, input: CreateSaleEventInput, db: Pick<Prisma.TransactionClient, "business"> = prisma) {
  const business = await db.business.findFirst({
    where: saleEventBusinessWhere(context), select: { id: true, name: true, description: true,
      services: { where: { business_id: context.businessId, id: { in: input.serviceIds } }, select: { name: true, category: true } },
      packages: { where: { business_id: context.businessId, id: { in: input.packageIds } }, select: { name: true } },
    },
  });
  if (!business) throw new SaleEventError("Forbidden");
  if (business.services.length !== input.serviceIds.length) throw new SaleEventError("One or more selected services are invalid for this business.");
  if (business.packages.length !== input.packageIds.length) throw new SaleEventError("One or more selected packages are invalid for this business.");
  return business;
}
