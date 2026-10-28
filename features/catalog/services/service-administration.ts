import "server-only";
import { prisma } from "@/prisma/prisma";
import { hasCurrentCatalogWriteAccess } from "@/features/catalog/catalog-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { serviceCatalogSelect } from "@/features/catalog/service-catalog-select";
import type { CreateServiceInput, UpdateServiceInput } from "@/features/catalog/service-administration-schemas";
import type { ServiceCatalogActor } from "@/features/catalog/types/service-administration";
import { startOfMonthPh, toServiceMutationData } from "@/features/catalog/catalog-mutation-dtos";

class ServiceAdministrationError extends Error {}

export function serviceAdministrationError(error: unknown, fallback: string) {
  if (error instanceof ServiceAdministrationError) return error.message;
  if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
    return "Service not found or unauthorized";
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
    return "Service catalog changed. Refresh and try again.";
  }
  return fallback;
}

async function requireTenantSuggestions(tx: Prisma.TransactionClient, businessId: string, flows: CreateServiceInput["flows"]) {
  const ids = [...new Set((flows ?? []).map((flow) => flow.suggested_service_id))];
  if (ids.length === 0) return;
  const count = await tx.service.count({ where: { business_id: businessId, id: { in: ids } } });
  if (count !== ids.length) throw new ServiceAdministrationError("One or more suggested services are invalid for this business.");
}

const transactionOptions = { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 } as const;

function serviceMutationSelect(now: Date, businessId: string) {
  return {
    ...serviceCatalogSelect,
    availed_services: {
      where: {
        created_at: { gte: startOfMonthPh(now), lte: now },
        status: { not: "CANCELLED" as const },
        booking: {
          business_id: businessId,
          status: { in: ["ACCEPTED" as const, "COMPLETED" as const] },
        },
      },
      select: { id: true },
    },
  } satisfies Prisma.ServiceSelect;
}

export async function createTenantCatalogService(actor: ServiceCatalogActor, input: CreateServiceInput) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    if (!await hasCurrentCatalogWriteAccess(tx, actor)) throw new ServiceAdministrationError("Forbidden");
    await requireTenantSuggestions(tx, actor.businessId, input.flows);
    const service = await tx.service.create({ select: serviceMutationSelect(now, actor.businessId), data: {
      name: input.name, description: input.description || null, price: input.price,
      estimated_cost: input.estimated_cost ?? 0, duration: input.duration || null,
      category: input.category, business_id: actor.businessId,
      flow_triggers: { createMany: { data: (input.flows ?? []).map((flow) => ({ ...flow, business_id: actor.businessId })) } },
    } });
    return toServiceMutationData(service);
  }, transactionOptions);
}

export async function updateTenantCatalogService(actor: ServiceCatalogActor, serviceId: number, input: UpdateServiceInput) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    if (!await hasCurrentCatalogWriteAccess(tx, actor)) throw new ServiceAdministrationError("Forbidden");
    const target = await tx.service.findFirst({ where: { id: serviceId, business_id: actor.businessId }, select: { id: true } });
    if (!target) throw new ServiceAdministrationError("Service not found or unauthorized");
    await requireTenantSuggestions(tx, actor.businessId, input.flows);
    const { flows, ...patch } = input;
    const service = await tx.service.update({ where: { id: serviceId, business_id: actor.businessId }, data: patch, select: serviceMutationSelect(now, actor.businessId) });
    if (flows !== undefined) {
      await tx.serviceFlow.deleteMany({ where: { trigger_service_id: serviceId, business_id: actor.businessId } });
      if (flows.length > 0) await tx.serviceFlow.createMany({ data: flows.map((flow) => ({ ...flow, trigger_service_id: serviceId, business_id: actor.businessId })) });
    }
    return toServiceMutationData(service);
  }, transactionOptions);
}

export async function deleteTenantCatalogService(actor: ServiceCatalogActor, serviceId: number) {
  return prisma.$transaction(async (tx) => {
    if (!await hasCurrentCatalogWriteAccess(tx, actor)) throw new ServiceAdministrationError("Forbidden");
    const deleted = await tx.service.deleteMany({ where: { id: serviceId, business_id: actor.businessId } });
    if (deleted.count !== 1) throw new ServiceAdministrationError("Service not found or unauthorized");
    return { id: serviceId };
  }, transactionOptions);
}
