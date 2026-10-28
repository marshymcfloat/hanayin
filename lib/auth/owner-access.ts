import "server-only";

import { requireAuth, requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { resolveTenantActorContext, type TenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { OwnerPermission, Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export type OwnerActorContext = Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;

export function ownerPermissionMembershipWhere(
  context: OwnerActorContext,
  permission: OwnerPermission,
): Prisma.OwnerWhereInput {
  return {
    id: context.ownerId,
    business_id: context.businessId,
    user_id: context.userId,
    user: { role: Role.OWNER },
    permissions: { has: permission },
  };
}

export async function requireOwnerPermission(businessSlug: string, permission: OwnerPermission): Promise<
  { success: true; context: OwnerActorContext } | { success: false; error: string }
> {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) return auth;
  return resolveOwnerPermissionAccess(businessSlug, auth.session.user.id, permission);
}

export async function requireAuthenticatedOwnerPermission(permission: OwnerPermission): Promise<
  { success: true; context: OwnerActorContext } | { success: false; error: string }
> {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) return { success: false, error: "Forbidden" };
  return resolveOwnerPermissionAccess(auth.businessSlug, auth.session.user.id, permission);
}

async function resolveOwnerPermissionAccess(businessSlug: string, userId: string, permission: OwnerPermission): Promise<
  { success: true; context: OwnerActorContext } | { success: false; error: string }
> {
  const context = await resolveTenantActorContext(businessSlug, userId);
  if (!context.success) return context;
  if (context.actorType !== "OWNER") return { success: false, error: "Forbidden" };

  const owner = await prisma.owner.findFirst({
    where: ownerPermissionMembershipWhere(context, permission),
    select: { id: true },
  });
  if (!owner) return { success: false, error: "Forbidden" };
  return { success: true, context };
}
