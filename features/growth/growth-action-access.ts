import "server-only";
import { requireOwnerTenantWriteAccess, requireTenantAccess } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { GrowthActor, GrowthOwnerActor } from "@/features/growth/growth-action-types";

export class GrowthActionError extends Error {}
export function growthActionFailure(error: unknown, fallback: string) { return { success: false as const, error: error instanceof GrowthActionError ? error.message : fallback }; }
export async function requireGrowthActionAccess(businessSlug: string, write: boolean, ai = false): Promise<{ success: true; actor: GrowthActor } | { success: false; error: string }> {
  const auth = write ? await requireOwnerTenantWriteAccess(businessSlug) : await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  if (auth.businessSlug !== businessSlug || !auth.session.user.id) return { success: false, error: "Forbidden" };
  const actor = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
  if (!actor.success) return actor;
  if (actor.businessSlug !== businessSlug || actor.userId !== auth.session.user.id || (write && (actor.actorType !== "OWNER" || actor.role !== "OWNER"))) return { success: false, error: "Forbidden" };
  const entitlements = await getBusinessEntitlementsBySlug(actor.businessSlug);
  if (!entitlements.growth) return { success: false, error: "Growth opportunities are available on Plus and Pro plans." };
  if (ai && !entitlements.ai) return { success: false, error: "AI growth campaign generation is available on Pro." };
  return { success: true, actor };
}
export async function assertGrowthActor(actor: GrowthActor, tx?: Prisma.TransactionClient) {
  const current = await resolveTenantActorContext(actor.businessSlug, actor.userId, tx);
  if (!current.success || current.businessId !== actor.businessId || current.businessSlug !== actor.businessSlug || current.userId !== actor.userId || current.actorType !== actor.actorType || current.role !== actor.role || current.ownerId !== actor.ownerId || current.employeeId !== actor.employeeId) throw new GrowthActionError("Forbidden");
}
export async function assertGrowthOwner(actor: GrowthOwnerActor, tx?: Prisma.TransactionClient) {
  if (actor.actorType !== "OWNER" || actor.role !== "OWNER") throw new GrowthActionError("Forbidden");
  await assertGrowthActor(actor, tx);
}
export function growthOwnerBusinessFilter(actor: GrowthOwnerActor): Prisma.BusinessWhereInput {
  return { id: actor.businessId, slug: actor.businessSlug, owners: { some: { id: actor.ownerId, user_id: actor.userId, business_id: actor.businessId, user: { role: "OWNER" } } } };
}
