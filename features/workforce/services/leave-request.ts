import {
  AttendanceStatus,
  LeaveRequestStatus,
  Role,
} from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { getStartOfDayPH } from "@/lib/date-utils";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";
import { logger } from "@/lib/logger";
import type { CreateLeaveRequestInput } from "@/features/workforce/schemas/leave-request";

type TenantActor = {
  businessSlug: string;
  userId: string;
  role: Role;
};

export async function createTenantLeaveRequest(
  data: CreateLeaveRequestInput,
  actor: TenantActor,
) {
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
      status: { not: LeaveRequestStatus.REJECTED },
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
    },
  });
  return { success: true as const };
}

export async function cancelTenantLeaveRequest(
  requestId: number,
  actor: TenantActor,
) {
  const leaveRequest = await prisma.leaveRequest.findFirst({
    where: {
      id: requestId,
      business: { slug: actor.businessSlug },
      ...(actor.role === Role.EMPLOYEE
        ? { employee: { user_id: actor.userId } }
        : {}),
    },
    select: {
      id: true,
      status: true,
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

  await prisma.leaveRequest.delete({ where: { id: leaveRequest.id } });
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
    await tx.leaveRequest.update({
      where: { id: leaveRequest.id },
      data: {
        status,
        admin_comment: adminComment,
        is_paid: isPaid ?? false,
      },
    });

    if (status !== LeaveRequestStatus.APPROVED) return;

    let date = getStartOfDayPH(leaveRequest.start_date);
    const endDate = getStartOfDayPH(leaveRequest.end_date);
    while (date <= endDate) {
      const attendanceDate = new Date(date);
      const existing = await tx.employeeAttendance.findFirst({
        where: {
          employee_id: leaveRequest.employee_id,
          date: attendanceDate,
        },
      });
      if (existing) {
        await tx.employeeAttendance.update({
          where: { id: existing.id },
          data: {
            status: AttendanceStatus.LEAVE,
            is_paid_leave: isPaid ?? false,
          },
        });
      } else {
        await tx.employeeAttendance.create({
          data: {
            employee_id: leaveRequest.employee_id,
            date: attendanceDate,
            status: AttendanceStatus.LEAVE,
            is_paid_leave: isPaid ?? false,
          },
        });
      }
      date.setDate(date.getDate() + 1);
      date = getStartOfDayPH(date);
    }
  });

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
