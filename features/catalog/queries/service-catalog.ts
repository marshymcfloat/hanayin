import "server-only";
import { prisma } from "@/prisma/prisma";
import type { ServiceCatalogActor } from "@/features/catalog/types/service-administration";
import { serviceCatalogSelect, serviceCatalogFlowSelect } from "@/features/catalog/service-catalog-select";

export async function listTenantCatalogServices(actor: ServiceCatalogActor) {
  return prisma.service.findMany({
    where: { business_id: actor.businessId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { ...serviceCatalogSelect, flow_triggers: {
      where: { business_id: actor.businessId, suggested_service: { business_id: actor.businessId } },
      select: serviceCatalogFlowSelect,
    } },
  });
}

export async function listTenantServiceCategories(actor: ServiceCatalogActor) {
  const services = await prisma.service.findMany({ where: { business_id: actor.businessId }, select: { category: true }, distinct: ["category"] });
  return services.map(({ category }) => category);
}
