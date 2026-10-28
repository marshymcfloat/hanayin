import "server-only";
import { prisma } from "@/prisma/prisma";
import { ownerSubscriptionBusinessFilter, type OwnerSubscriptionActor } from "@/features/billing/owner-subscription-access";

export async function getOwnerSubscriptionId(actor: OwnerSubscriptionActor) {
  const business = await prisma.business.findFirst({ where: ownerSubscriptionBusinessFilter(actor), select: { subscriptions: { take: 1, select: { id: true } } } });
  return business?.subscriptions[0]?.id ?? null;
}
