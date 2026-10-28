import "server-only";
import {
  LeaveRequestStatus,
  Role,
} from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { getStartOfDayPH } from "@/lib/date-utils";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";
import { logger } from "@/lib/logger";
import type { CreateLeaveRequestInput } from "@/features/workforce/schemas/leave-request";
import { currentWorkforceOwner } from "@/features/workforce/workforce-access";
import { logAudit } from "@/lib/services/audit";
import { allocateApprovedLeave } from "./leave-allocation";

type TenantActor = {
  businessSlug: string;
  userId: string;
  role: Role;
};

export async function createTenantLeaveRequest(
  data: CreateLeaveRequestInput,
  actor: TenantActor,
) {
  if (actor.role === Role.OWNER && !await currentWorkforceOwner(actor.businessSlug, actor.userId)) return { success: false as const, error: "Forbidden" };
  const employee = await prisma.employee.findFirst({
    where: {
      id: data.employee_id,
      business_id: data.business_id,
      business: { slug: actor.businessSlug },
      ...(actor.role === Role.EMPLOYEE ? { user_id: actor.userId } : {}),
    },
    select: { id: true, business_id: true },
  });
  if (!employee || actor.role === Role.PLATFORM_ADMIN) {
    return { success: false as const, error: "Unauthorized" };
  }

  const startDatePH = getStartOfDayPH(data.start_date);
  const endDatePH = getStartOfDayPH(data.end_date);
  if (endDatePH < startDatePH) {
    return {
      success: false as const,
      error: "End date must be after start date",
    };
  }

  const currentYear = new Date().getFullYear();
  if (
    startDatePH.getFullYear() < currentYear ||
    endDatePH.getFullYear() > currentYear + 1
  ) {
    return {
      success: false as const,
      error: "Leave requests must be within the current or next year",
    };
  }

  const existingRequests = await prisma.leaveRequest.findMany({
    where: {
      employee_id: employee.id,
      business_id: employee.business_id,
      status: { not: LeaveRequestStatus.REJECTED }, cancelled_at: null,
      OR: [
        {
          start_date: { lte: endDatePH },
          end_date: { gte: startDatePH },
        },
      ],
    },
  });
  if (existingRequests.length > 0) {
    return {
      success: false as const,
      error: "You already have a leave request for these dates.",
    };
  }

  await prisma.leaveRequest.create({
    data: {
      employee_id: employee.id,
      business_id: employee.business_id,
      start_date: startDatePH,
      end_date: endDatePH,
      reason: data.reason,
      type: data.type,
      benefit_code: data.benefit_code ?? "DISCRETIONARY",
    },
  });
  return { success: true as const };
}

export async function cancelTenantLeaveRequest(
  requestId: number,
  actor: TenantActor,
) {
  if (actor.role === Role.OWNER && !await currentWorkforceOwner(actor.businessSlug, actor.userId)) return { success: false as const, error: "Forbidden" };
  const leaveRequest = await prisma.leaveRequest.findFirst({
    where: {
      id: requestId,
      business: { slug: actor.businessSlug },
      ...(actor.role === Role.EMPLOYEE
        ? { employee: { user_id: actor.userId, archived_at: null, user: { role: "EMPLOYEE" } } }
        : {}),
    },
    select: {
      id: true,
      status: true,
      benefit_code: true,
    },
  });
  if (!leaveRequest || actor.role === Role.PLATFORM_ADMIN) {
    return { success: false as const, error: "Leave request not found" };
  }
  if (leaveRequest.status !== LeaveRequestStatus.PENDING) {
    return {
      success: false as const,
      error: "Only pending leave requests can be cancelled",
    };
  }

  const cancelled = await prisma.leaveRequest.updateMany({ where: { id: leaveRequest.id, status: "PENDING", cancelled_at: null, business: { slug: actor.businessSlug } }, data: { cancelled_at: new Date(), revision: { increment: 1 } } });
  if (cancelled.count !== 1) return { success: false as const, error: "Leave request changed. Refresh and try again." };
  return { success: true as const };
}

export async function updateTenantLeaveRequestStatus(
  requestId: number,
  status: LeaveRequestStatus,
  adminComment: string | undefined,
  isPaid: boolean | undefined,
  actor: TenantActor,
) {
  if (actor.role !== Role.OWNER) {
    return { success: false as const, error: "Forbidden" };
  }

  const leaveRequest = await prisma.leaveRequest.findFirst({
    where: { id: requestId, business: { slug: actor.businessSlug } },
    select: {
      id: true,
      employee_id: true,
      business_id: true,
      start_date: true,
      end_date: true,
      status: true,
      benefit_code: true,
    },
  });
  if (!leaveRequest) {
    return { success: false as const, error: "Leave request not found" };
  }
  if (leaveRequest.status !== LeaveRequestStatus.PENDING) {
    return {
      success: false as const,
      error: "Only pending leave requests can be updated",
    };
  }

  await prisma.$transaction(async (tx) => {
    const owner = await currentWorkforceOwner(actor.businessSlug, actor.userId, tx);
    if (!owner || owner.business_id !== leaveRequest.business_id) throw new Error("Forbidden");
    const employee = await tx.employee.findFirst({ where: { id: leaveRequest.employee_id, business_id: owner.business_id, archived_at: null }, include: { schedule: true, business: { select: { formal_schedule_enabled: true, business_hours: true } } } });
    if (!employee) throw new Error("Employee not found");
    const updated = await tx.leaveRequest.updateMany({
      where: { id: leaveRequest.id, business_id: owner.business_id, status: "PENDING", cancelled_at: null },
      data: {
        status,
        admin_comment: adminComment,
        is_paid: isPaid ?? false,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new Error("Leave request changed. Refresh and try again.");
    await logAudit(tx, { entityType: "LeaveRequest", entityId: String(leaveRequest.id), action: "UPDATED", actorId: actor.userId, businessId: owner.business_id, changes: { after: { status, is_paid: isPaid ?? false } } });

    if (status !== LeaveRequestStatus.APPROVED) return;
    await allocateApprovedLeave(tx, { ...leaveRequest, benefit_code: leaveRequest.benefit_code ?? "DISCRETIONARY" }, isPaid ?? false);
  }, { isolationLevel: "Serializable" });

  if (status === LeaveRequestStatus.APPROVED) {
    try {
      await detectAndEmitFutureBookingConflicts({
        businessId: leaveRequest.business_id,
        changedDate: leaveRequest.start_date,
        trigger: "LEAVE_APPROVED",
      });
    } catch (error) {
      logger.warn("[BookingConflicts] Failed after leave approval", {
        requestId,
        businessSlug: actor.businessSlug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { success: true as const };
}
