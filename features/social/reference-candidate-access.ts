import "server-only";
import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

export class ReferenceCandidateError extends Error {}
export const referenceCandidateFailure = (error: unknown, fallback = "Unable to update reference candidates.") => ({ success: false as const, error: error instanceof ReferenceCandidateError ? error.message : fallback });
export async function requireReferencePilotAccess(businessSlug: string): Promise<{ success: true; actor: OwnerActorContext } | { success: false; error: string }> {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) return auth;
  if (auth.businessSlug !== businessSlug) return { success: false, error: "Forbidden" };
  if (auth.businessSlug !== "beautyfeel") return { success: false, error: "Reference discovery is currently a Beautyfeel pilot." };
  const actor = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
  if (!actor.success) {
    if (actor.error === "Unauthorized" && !await prisma.business.findUnique({ where: { slug: auth.businessSlug }, select: { id: true } })) return { success: false, error: "Business not found." };
    return actor;
  }
  if (actor.actorType !== "OWNER") return { success: false, error: "Forbidden" };
  return { success: true, actor };
}
export async function assertReferenceCandidateOwner(db: Pick<Prisma.TransactionClient, "owner">, actor: OwnerActorContext) {
  if (actor.businessSlug !== "beautyfeel" || actor.actorType !== "OWNER" || actor.role !== "OWNER" || !await db.owner.findFirst({ where: { id: actor.ownerId, user_id: actor.userId, business_id: actor.businessId, business: { id: actor.businessId, slug: actor.businessSlug }, user: { role: "OWNER" } }, select: { id: true } })) throw new ReferenceCandidateError("Forbidden");
}
