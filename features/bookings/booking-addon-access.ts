import "server-only";

import { requireAuth } from "@/lib/auth/guards";
import { hasStaffPermission, resolveTenantActorContext, sanitizeStaffPermissions, type TenantActorContext } from "@/lib/auth/staff-access";
import { Role, StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";
import type { Prisma, PrismaClient } from "@/prisma/generated/prisma/client";
import { BookingAddOnError, safeBookingAddOnError } from "@/features/bookings/booking-addon-errors";

export type BookingAddOnActor = Extract<TenantActorContext, { success: true }>;
type Db = Prisma.TransactionClient | PrismaClient;

function assertGate(actor: BookingAddOnActor) {
  if (
    (actor.actorType === "OWNER" && actor.role === Role.OWNER) ||
    (actor.actorType === "EMPLOYEE" && actor.role === Role.EMPLOYEE &&
      (hasStaffPermission(actor, StaffPermission.BOOKING_CREATE) || hasStaffPermission(actor, StaffPermission.BOOKING_MODIFY)))
  ) return;
  throw new BookingAddOnError("Forbidden");
}
export async function requireBookingAddOnAccess(): Promise<BookingAddOnActor> {
  try {
    const auth = await requireAuth({ write: true });
    if (!auth.success) throw new Error(auth.error);
    if (!auth.session.user.id) throw new BookingAddOnError("Unauthorized");
    const actor = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!actor.success) throw new Error(actor.error);
    assertGate(actor);
    return actor;
  } catch (error) { throw safeBookingAddOnError(error); }
}
export function resolveBookingAddOnInitiator(actor: BookingAddOnActor, requested?: number) {
  assertGate(actor);
  if (actor.actorType === "EMPLOYEE") {
    if (requested !== undefined && requested !== actor.employeeId) throw new BookingAddOnError("Forbidden");
    return actor.employeeId;
  }
  return requested;
}
export async function recheckBookingAddOnAccess(db: Db, actor: BookingAddOnActor, initiatorEmployeeId?: number): Promise<BookingAddOnActor> {
  if (
    (actor.actorType !== "OWNER" || actor.role !== Role.OWNER) &&
    (actor.actorType !== "EMPLOYEE" || actor.role !== Role.EMPLOYEE)
  ) throw new BookingAddOnError("Forbidden");
  const business = await db.business.findFirst({
    where: { id: actor.businessId, slug: actor.businessSlug },
    select: { id: true, structure: true, allow_employee_self_booking: true, manager_can_serve: true },
  });
  if (!business) throw new BookingAddOnError("Forbidden");
  let current: BookingAddOnActor = {
    ...actor,
    businessPolicy: {
      structure: business.structure, allowEmployeeSelfBooking: business.allow_employee_self_booking, managerCanServe: business.manager_can_serve,
    },
  };
  if (actor.actorType === "OWNER") {
    const owner = await db.owner.findFirst({
      where: { id: actor.ownerId, business_id: actor.businessId, user_id: actor.userId, user: { role: Role.OWNER } },
      select: { id: true },
    });
    if (!owner) throw new BookingAddOnError("Forbidden");
  } else {
    const employee = await db.employee.findFirst({
      where: { id: actor.employeeId, business_id: actor.businessId, user_id: actor.userId, user: { role: Role.EMPLOYEE } },
      select: { id: true, profile: true, permissions: true },
    });
    if (!employee) throw new BookingAddOnError("Forbidden");
    const profile = employee.profile ?? StaffProfile.STAFF;
    current = { ...actor, profile, permissions: sanitizeStaffPermissions(profile, employee.permissions), businessPolicy: {
      structure: business.structure, allowEmployeeSelfBooking: business.allow_employee_self_booking, managerCanServe: business.manager_can_serve,
    } };
  }
  assertGate(current);
  if (current.actorType === "EMPLOYEE") {
    if (initiatorEmployeeId !== undefined && initiatorEmployeeId !== current.employeeId) throw new BookingAddOnError("Forbidden");
  } else if (initiatorEmployeeId !== undefined) {
    const employee = await db.employee.findFirst({ where: { id: initiatorEmployeeId, business_id: current.businessId, user: { role: Role.EMPLOYEE } }, select: { id: true } });
    if (!employee) throw new BookingAddOnError("Employee not found.");
  }
  return current;
}
