import "server-only";
import { hasStaffPermission, sanitizeStaffPermissions, type TenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { Role, StaffPermission } from "@/prisma/generated/prisma/enums";

export type CatalogActorContext = Extract<TenantActorContext, { success: true }>;

export async function hasCurrentCatalogWriteAccess(tx: Prisma.TransactionClient, context: CatalogActorContext): Promise<boolean> {
  if (context.actorType === "OWNER") {
    return !!await tx.owner.findFirst({
      where: { id: context.ownerId, user_id: context.userId, business_id: context.businessId, user: { role: Role.OWNER } },
      select: { id: true },
    });
  }
  if (context.actorType !== "EMPLOYEE") return false;
  const employee = await tx.employee.findFirst({
    where: { id: context.employeeId, user_id: context.userId, business_id: context.businessId, user: { role: Role.EMPLOYEE } },
    select: { profile: true, permissions: true },
  });
  if (!employee) return false;
  return hasStaffPermission({
    ...context, profile: employee.profile,
    permissions: sanitizeStaffPermissions(employee.profile, employee.permissions),
  }, StaffPermission.CATALOG_MANAGE);
}
