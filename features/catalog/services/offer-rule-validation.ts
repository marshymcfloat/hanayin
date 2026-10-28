import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { matchesServiceRule, type ServiceRule } from "@/features/catalog/offer-definitions";

export async function validateOfferRules(db: Pick<Prisma.TransactionClient, "service">, businessId: string, rules: ServiceRule[]) {
  if (!rules.length) return;
  const services = await db.service.findMany({ where: { business_id: businessId }, select: { id: true, category: true, price: true } });
  for (const rule of rules) {
    if (rule.kind === "SERVICES" && rule.serviceIds.some(id => !services.some(service => service.id === id))) throw new Error("One or more selected services are invalid for this business.");
    if (!services.some(service => matchesServiceRule(rule, service))) throw new Error("Every service group must have at least one eligible service.");
  }
}
