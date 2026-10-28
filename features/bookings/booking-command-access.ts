import "server-only";
import { getDefaultPermissionsForProfile, hasStaffPermission, resolveTenantActorContext, type TenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";

export type BookingCommandActor = Extract<TenantActorContext, { success: true }>;
type BookingCommandPermission = "BOOKING_MODIFY" | "BOOKING_MARK_NO_SHOW";

export async function recheckBookingCommandAccess(tx: Prisma.TransactionClient, expected: BookingCommandActor, permission: BookingCommandPermission): Promise<Prisma.BusinessWhereInput | null> {
  const current = await resolveTenantActorContext(expected.businessSlug, expected.userId, tx);
  if (!current.success || current.businessId !== expected.businessId || current.actorType !== expected.actorType || current.role !== expected.role || current.ownerId !== expected.ownerId || current.employeeId !== expected.employeeId || !hasStaffPermission(current, permission)) return null;
  const policy = current.businessPolicy;
  const business = { id: current.businessId, slug: current.businessSlug, structure: policy.structure, allow_employee_self_booking: policy.allowEmployeeSelfBooking, manager_can_serve: policy.managerCanServe };
  if (current.actorType === "OWNER") return { ...business, owners: { some: { id: current.ownerId, user_id: current.userId, business_id: current.businessId, user: { role: "OWNER" } } } };
  const defaultsAllow = getDefaultPermissionsForProfile(current.profile).includes(permission);
  return { ...business, employees: { some: { id: current.employeeId, user_id: current.userId, business_id: current.businessId, user: { role: "EMPLOYEE" }, profile: current.profile,
    OR: [{ permissions: { has: permission } }, ...(defaultsAllow ? [{ permissions: { isEmpty: true } }] : [])],
  } } };
}
