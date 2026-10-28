import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { resolveTenantActorContext, type TenantActorContext } from "@/lib/auth/staff-access";
import { prisma } from "@/prisma/prisma";

export type AttendanceIdentity = { businessSlug: string; userId: string };
type AttendanceActor = Extract<TenantActorContext, { success: true }>;
export type AttendanceAccess = { success: true; actor: AttendanceActor; employee: Prisma.EmployeeWhereInput; business: Prisma.BusinessWhereInput };
type AccessDatabase = Pick<Prisma.TransactionClient, "business" | "user" | "employee">;

export async function resolveAttendanceSelfServiceAccess(identity: AttendanceIdentity, employeeId: number, selfOnly: boolean, db: AccessDatabase = prisma, expected?: AttendanceActor): Promise<AttendanceAccess | { success: false; reason: "self" | "membership" }> {
  const actor = await resolveTenantActorContext(identity.businessSlug, identity.userId, db);
  if (!actor.success) return { success: false, reason: "membership" };
  if ((actor.actorType === "EMPLOYEE" && actor.employeeId !== employeeId) || (selfOnly && actor.actorType !== "EMPLOYEE")) return { success: false, reason: "self" };
  if (expected && (actor.businessId !== expected.businessId || actor.role !== expected.role || actor.actorType !== expected.actorType || actor.employeeId !== expected.employeeId || actor.ownerId !== expected.ownerId)) return { success: false, reason: "membership" };
  const membership: Prisma.BusinessWhereInput = actor.actorType === "OWNER"
    ? { owners: { some: { id: actor.ownerId, user_id: actor.userId, business_id: actor.businessId, user: { role: "OWNER" } } } }
    : { employees: { some: { id: actor.employeeId, user_id: actor.userId, business_id: actor.businessId, user: { role: "EMPLOYEE" } } } };
  const business = { id: actor.businessId, slug: actor.businessSlug, ...membership } satisfies Prisma.BusinessWhereInput;
  const employee = { id: employeeId, business_id: actor.businessId, business,
    ...(actor.actorType === "EMPLOYEE" ? { user_id: actor.userId, user: { role: "EMPLOYEE" as const } } : {}),
  } satisfies Prisma.EmployeeWhereInput;
  if (!await db.employee.findFirst({ where: employee, select: { id: true } })) return { success: false, reason: "membership" };
  return { success: true, actor, employee, business };
}
