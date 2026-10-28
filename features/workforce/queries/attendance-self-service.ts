import "server-only";
import { prisma } from "@/prisma/prisma";
import { getEndOfDayPH, getMonthRangePH, getStartOfDayPH } from "@/lib/date-utils";
import { resolveAttendanceSelfServiceAccess, type AttendanceIdentity } from "@/features/workforce/attendance-self-service-access";
import type { AttendanceMonthlyInput, AttendanceStatusInput } from "@/features/workforce/attendance-self-service-schemas";

export async function getSelfServiceAttendanceStatus(identity: AttendanceIdentity, input: AttendanceStatusInput) {
  try {
    const access = await resolveAttendanceSelfServiceAccess(identity, input.employeeId, false);
    if (!access.success) return { success: false as const, error: access.reason === "self" ? "Unauthorized access to attendance record" : "Employee not found or unauthorized" };
    let data = await prisma.employeeAttendance.findFirst({ where: { employee_id: input.employeeId, employee: access.employee, date: { gte: getStartOfDayPH(input.date), lte: getEndOfDayPH(input.date) } } });
    if (access.actor.actorType === "EMPLOYEE" && getStartOfDayPH(input.date).getTime() === getStartOfDayPH().getTime()) {
      const open = await prisma.employeeAttendance.findMany({ where: { employee_id: input.employeeId, employee: access.employee, time_in: { gte: new Date(Date.now() - 24 * 3600000), lte: new Date() }, time_out: null }, orderBy: { time_in: "desc" }, take: 2 });
      if (open.length > 1) return { success: false as const, error: "Conflicting open attendance records need owner review." };
      data = open[0] ?? data;
    }
    return { success: true as const, data };
  } catch { return { success: false as const, error: "Failed to check status" }; }
}

export async function getSelfServiceMonthlyAttendance(identity: AttendanceIdentity, input: AttendanceMonthlyInput) {
  try {
    const access = await resolveAttendanceSelfServiceAccess(identity, input.employeeId, false);
    if (!access.success) return { success: false as const, error: access.reason === "self" ? "Unauthorized" : "Employee not found or unauthorized" };
    const { startDate, endDate } = getMonthRangePH(input.year, input.month);
    const data = await prisma.employeeAttendance.findMany({ where: { employee_id: input.employeeId, employee: access.employee, date: { gte: startDate, lte: endDate } } });
    return { success: true as const, data };
  } catch { return { success: false as const, error: "Failed to fetch monthly attendance" }; }
}
