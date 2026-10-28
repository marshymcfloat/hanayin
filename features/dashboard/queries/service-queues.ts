import "server-only";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { getEmployeeSpecialtySet, isCategoryAllowedForEmployee } from "@/lib/utils/employee-specialties";
import { getCurrentDateTimePH, getStartOfDayPH } from "@/lib/date-utils";

type QueueActor = Extract<TenantActorContext, { success: true }>;

function currentMembership(context: QueueActor): Prisma.BusinessWhereInput {
  return context.actorType === "OWNER"
    ? { owners: { some: { id: context.ownerId, user_id: context.userId, user: { role: "OWNER" } } } }
    : { employees: { some: { id: context.employeeId, user_id: context.userId, user: { role: "EMPLOYEE" } } } };
}

function queueBookingScope(context: QueueActor): Prisma.BookingWhereInput {
  return { business_id: context.businessId, status: { in: ["ACCEPTED"] }, business: currentMembership(context), OR: [{ customer_id: null }, { customer: { business_id: context.businessId } }] };
}

function queueScope(context: QueueActor): Prisma.AvailedServiceWhereInput {
  return {
    booking: queueBookingScope(context),
    service: { business_id: context.businessId },
    OR: [{ package_id: null }, { package: { business_id: context.businessId } }],
  };
}

export async function getTenantPendingServiceQueue(
  context: QueueActor,
  options?: { take?: number },
) {
  let specialtySet: Set<string> | null = null;
  if (context.actorType === "EMPLOYEE") {
    const employee = await prisma.employee.findFirst({
      where: { id: context.employeeId, user_id: context.userId, business_id: context.businessId, user: { role: "EMPLOYEE" } },
      select: { specialties: true },
    });
    if (!employee) return [];
    specialtySet = getEmployeeSpecialtySet(employee.specialties);
  }
  const rows = await prisma.availedService.findMany({
    where: { ...queueScope(context), status: "PENDING" },
    select: {
      id: true, price: true, scheduled_at: true, package_id: true,
      package: { select: { name: true } },
      service: { select: { id: true, name: true, duration: true, category: true } },
      booking: { select: { customer: { select: { name: true } }, scheduled_at: true, created_at: true, downpayment: true, downpayment_status: true, grand_total: true, amount_paid: true, payment_status: true } },
    },
    orderBy: { scheduled_at: "asc" },
    ...(options?.take ? { take: options.take } : {}),
  });
  return context.actorType === "EMPLOYEE"
    ? rows.filter(item => isCategoryAllowedForEmployee(item.service.category, specialtySet))
    : rows;
}

export function getTenantOwnerClaimedServiceQueue(
  context: Extract<QueueActor, { actorType: "OWNER" }>,
  options?: { take?: number },
) {
  return prisma.availedService.findMany({
    where: { ...queueScope(context), served_by_owner_id: context.ownerId, status: { in: ["CLAIMED", "SERVING"] } },
    select: {
      id: true, price: true, final_price: true, discount: true, discount_reason: true, scheduled_at: true, claimed_at: true, status: true, package_id: true,
      package: { select: { name: true } }, service: { select: { name: true, duration: true } },
      booking: { select: { customer: { select: { name: true } }, scheduled_at: true, created_at: true } },
    },
    orderBy: { scheduled_at: "asc" },
    ...(options?.take ? { take: options.take } : {}),
  });
}

export function getTenantOwnerRecentlyCompletedServiceQueue(
  context: Extract<QueueActor, { actorType: "OWNER" }>,
  options?: { take?: number; since?: Date },
) {
  const scope = queueScope(context);
  return prisma.availedService.findMany({
    where: {
      ...scope,
      booking: { ...queueBookingScope(context), status: { in: ["ACCEPTED", "COMPLETED"] } },
      served_by_owner_id: context.ownerId,
      served_by_id: null,
      served_by_type: "OWNER",
      status: "COMPLETED",
      completed_at: { gte: options?.since ?? getStartOfDayPH(getCurrentDateTimePH()) },
      cancelled_at: null,
      paid_in_payslip_id: null,
    },
    select: {
      id: true, final_price: true, scheduled_at: true, completed_at: true,
      package: { select: { name: true } },
      service: { select: { name: true } },
      booking: { select: { customer: { select: { name: true } }, scheduled_at: true } },
    },
    orderBy: { completed_at: "desc" },
    take: options?.take ?? 20,
  });
}
