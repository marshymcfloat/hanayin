import "server-only";
import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { ownerPermissionMembershipWhere, type OwnerActorContext } from "@/lib/auth/owner-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { OwnerPermission, Role } from "@/prisma/generated/prisma/enums";
import type { BrandAssetActor } from "@/features/assets/brand-asset-types";
export async function requireBrandAssetReadAccess() {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  if (!auth.session.user.id) return { success: false as const, error: "Unauthorized" };
  const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
  return context.success ? { success: true as const, context } : context;
}
export function brandAssetBusinessWhere(context: BrandAssetActor): Prisma.BusinessWhereInput {
  if ((context.actorType !== "OWNER" && context.actorType !== "EMPLOYEE") ||
    (context.actorType === "OWNER" ? context.role !== Role.OWNER : context.role !== Role.EMPLOYEE)) throw new Error("Forbidden");
  const membership = { user_id: context.userId, business_id: context.businessId };
  return { id: context.businessId, slug: context.businessSlug,
    ...(context.actorType === "OWNER" ? { owners: { some: { ...membership, id: context.ownerId, user: { role: Role.OWNER } } } } : { employees: { some: { ...membership, id: context.employeeId, user: { role: Role.EMPLOYEE } } } }),
  };
}
export function brandAssetOwnerWhere(context: OwnerActorContext): Prisma.OwnerWhereInput {
  return { ...ownerPermissionMembershipWhere(context, OwnerPermission.SETTINGS_MANAGE), business: { id: context.businessId, slug: context.businessSlug } };
}
