import "server-only";
import { requireOwnerPermission, ownerPermissionMembershipWhere, type OwnerActorContext } from "@/lib/auth/owner-access";
import { OwnerPermission, Role } from "@/prisma/generated/prisma/enums";
import type { Prisma } from "@/prisma/generated/prisma/client";
export async function requireBusinessSettingsAccess(slug: string) { return requireOwnerPermission(slug, OwnerPermission.SETTINGS_MANAGE); }
export function businessSettingsWhere(context: OwnerActorContext): Prisma.BusinessWhereInput {
  if (context.actorType !== "OWNER" || context.role !== Role.OWNER) throw new Error("Forbidden");
  return { id: context.businessId, slug: context.businessSlug, owners: { some: ownerPermissionMembershipWhere(context, OwnerPermission.SETTINGS_MANAGE) } };
}
