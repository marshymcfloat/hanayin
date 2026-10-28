import "server-only";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";

export type OwnerSubscriptionActor = { businessId: string; businessSlug: string; userId: string; ownerId: number };

export async function resolveOwnerSubscriptionActor(businessSlug: string, userId: string, tx?: Prisma.TransactionClient): Promise<OwnerSubscriptionActor | null> {
  const actor = await resolveTenantActorContext(businessSlug, userId, tx);
  if (!actor.success || actor.actorType !== "OWNER" || actor.role !== "OWNER") return null;
  return { businessId: actor.businessId, businessSlug: actor.businessSlug, userId: actor.userId, ownerId: actor.ownerId };
}

export async function recheckOwnerSubscriptionActor(tx: Prisma.TransactionClient, expected: OwnerSubscriptionActor) {
  const current = await resolveOwnerSubscriptionActor(expected.businessSlug, expected.userId, tx);
  return !!current && current.businessId === expected.businessId && current.businessSlug === expected.businessSlug && current.userId === expected.userId && current.ownerId === expected.ownerId;
}

export function ownerSubscriptionBusinessFilter(actor: OwnerSubscriptionActor): Prisma.BusinessWhereInput {
  return { id: actor.businessId, slug: actor.businessSlug, owners: { some: { id: actor.ownerId, user_id: actor.userId, business_id: actor.businessId, user: { role: "OWNER" } } } };
}
