import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { resolveTenantActorContext, type TenantActorContext } from "@/lib/auth/staff-access";
import { prisma } from "@/prisma/prisma";
import type { EmployeeAdministrationIdentity } from "@/features/workforce/employee-administration-types";
export type EmployeeAdministrationActor = Extract<TenantActorContext, { success: true }>;
type Database = Pick<Prisma.TransactionClient, "business" | "user">;
export async function resolveEmployeeAdministrationAccess(identity: EmployeeAdministrationIdentity, ownerOnly: boolean, db: Database = prisma, expected?: EmployeeAdministrationActor) {
  const actor = await resolveTenantActorContext(identity.businessSlug, identity.userId, db);
  if (!actor.success || (ownerOnly && actor.actorType !== "OWNER")) return null;
  if (expected && (actor.businessId !== expected.businessId || actor.actorType !== expected.actorType || actor.ownerId !== expected.ownerId || actor.employeeId !== expected.employeeId || actor.role !== expected.role)) return null;
  const business: Prisma.BusinessWhereInput = { id: actor.businessId, slug: actor.businessSlug,
    ...(actor.actorType === "OWNER" ? { owners: { some: { id: actor.ownerId, business_id: actor.businessId, user_id: actor.userId, user: { role: "OWNER" }, permissions: { has: "EMPLOYEES_MANAGE" } } } } : { employees: { some: { id: actor.employeeId, business_id: actor.businessId, user_id: actor.userId, user: { role: "EMPLOYEE" } } } }),
  };
  return { actor, business };
}
export function employeeAdministrationTargetWhere(access: NonNullable<Awaited<ReturnType<typeof resolveEmployeeAdministrationAccess>>>, employeeId: number): Prisma.EmployeeWhereInput {
  return { id: employeeId, business_id: access.actor.businessId, business: access.business, user: { role: "EMPLOYEE", owner: { is: null } } };
}
