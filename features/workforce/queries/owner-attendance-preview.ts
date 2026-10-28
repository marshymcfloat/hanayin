import "server-only";

import { prisma } from "@/prisma/prisma";
import { Role } from "@/prisma/generated/prisma/enums";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import { attendancePreviewDayBounds } from "@/features/workforce/owner-attendance-preview-date";
import { payrollDate } from "@/features/payroll/public";
import type { OwnerAttendancePreviewData } from "@/features/workforce/types/owner-attendance-preview";

type AttendanceDb = Pick<Prisma.TransactionClient, "business" | "employee" | "leaveRequest">;

export async function getOwnerAttendancePreviewData(
  actor: OwnerActorContext,
  date: string,
  db: AttendanceDb = prisma,
): Promise<OwnerAttendancePreviewData | null> {
  const business = await db.business.findFirst({
    where: {
      id: actor.businessId,
      slug: actor.businessSlug,
      owners: { some: {
        id: actor.ownerId,
        business_id: actor.businessId,
        user_id: actor.userId,
        user: { role: Role.OWNER },
        permissions: { has: "WORKFORCE_MANAGE" },
      } },
    },
    select: { name: true },
  });
  if (!business) return null;

  const { start, end } = attendancePreviewDayBounds(date);
  const [employees, leaveRequests, pendingLeaveCount] = await Promise.all([
    db.employee.findMany({
      where: { business_id: actor.businessId, user: { role: Role.EMPLOYEE }, archived_at: null },
      orderBy: { user: { name: "asc" } },
      select: {
        id: true,
        profile: true,
        leave_allocations: { where: { work_date: payrollDate(date), cancelled_at: null }, select: { id: true }, take: 1 },
        user: { select: { name: true } },
        attendance: {
          where: { date: { gte: start, lte: end } },
          take: 1,
          select: { status: true, time_in: true, time_out: true },
        },
      },
    }),
    db.leaveRequest.findMany({
      where: { business_id: actor.businessId, employee: { business_id: actor.businessId }, cancelled_at: null },
      orderBy: [{ status: "asc" }, { created_at: "desc" }],
      take: 20,
      select: {
        id: true, start_date: true, end_date: true, reason: true,
        created_at: true, status: true,
        employee: { select: { user: { select: { name: true } } } },
      },
    }),
    db.leaveRequest.count({
      where: { business_id: actor.businessId, employee: { business_id: actor.businessId }, status: "PENDING", cancelled_at: null },
    }),
  ]);

  return {
    businessName: business.name,
    date,
    employees: employees.map((employee) => {
      const attendance = employee.attendance[0];
      return {
        id: employee.id,
        name: employee.user.name,
        role: employee.profile,
        status: attendance?.status ?? (employee.leave_allocations?.length ? "LEAVE" : "UNRECORDED"),
        timeIn: attendance?.time_in?.toISOString() ?? null,
        timeOut: attendance?.time_out?.toISOString() ?? null,
      };
    }),
    pendingLeaveCount,
    leaveRequests: leaveRequests.map((request) => ({
      id: request.id,
      employeeName: request.employee.user.name,
      startDate: request.start_date.toISOString(),
      endDate: request.end_date.toISOString(),
      reason: request.reason,
      submittedAt: request.created_at.toISOString(),
      status: request.status,
    })),
  };
}
