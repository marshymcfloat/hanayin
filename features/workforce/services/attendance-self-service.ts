import "server-only";
import { prisma } from "@/prisma/prisma";
import { getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import { verifyAttendanceLocation } from "@/lib/services/attendance-location";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";
import { logger } from "@/lib/logger";
import { resolveAttendanceSelfServiceAccess, type AttendanceIdentity } from "@/features/workforce/attendance-self-service-access";
import type { AttendanceClockInput } from "@/features/workforce/attendance-self-service-schemas";

const transactionOptions = { isolationLevel: "Serializable" as const, maxWait: 5_000, timeout: 10_000 };
class AttendanceWriteConflict extends Error {}

async function clockAttendance(identity: AttendanceIdentity, input: AttendanceClockInput, direction: "in" | "out") {
  const unauthorized = `Unauthorized: You can only clock ${direction} for yourself.`;
  try {
    if (identity.businessSlug !== input.businessSlug) return { success: false as const, error: "Unauthorized business context" };
    const original = await resolveAttendanceSelfServiceAccess(identity, input.employeeId, true);
    if (!original.success) return { success: false as const, error: unauthorized };
    const now = new Date(); const startOfDay = getStartOfDayPH(now); const endOfDay = getEndOfDayPH(now);
    const result = await prisma.$transaction(async tx => {
      const access = await resolveAttendanceSelfServiceAccess(identity, input.employeeId, true, tx, original.actor);
      if (!access.success) return { success: false as const, error: unauthorized };
      const business = await tx.business.findFirst({ where: access.business, select: { latitude: true, longitude: true } });
      if (!business || business.latitude === null || business.longitude === null) return { success: false as const, error: "Business location not set. Contact owner." };
      const location = verifyAttendanceLocation({ staffLatitude: input.latitude, staffLongitude: input.longitude, businessLatitude: business.latitude, businessLongitude: business.longitude });
      if (!location.success) return location;
      const own = { employee_id: input.employeeId, employee: access.employee };
      const todayWhere = { ...own, date: { gte: startOfDay, lte: endOfDay } };
      const open = await tx.employeeAttendance.findMany({ where: { ...own, time_in: { not: null }, time_out: null }, orderBy: { time_in: "desc" }, take: 2 });
      if (open.length > 1) return { success: false as const, error: "Conflicting open attendance records need owner review." };
      if (direction === "in" && open.length) return { success: false as const, error: "An earlier clock-in is still open. Clock out or request an attendance correction." };
      const attendance = direction === "in" ? await tx.employeeAttendance.findFirst({ where: todayWhere }) : open[0];
      if (direction === "in" && attendance) return { success: false as const, error: "Already clocked in today." };
      if (direction === "out" && !attendance) return { success: false as const, error: "No open attendance record found. Request an attendance correction if a clock is missing." };
      if (attendance && (!attendance.time_in || attendance.time_in.getTime() > now.getTime() || now.getTime() - attendance.time_in.getTime() > 24 * 3600000 || attendance.time_out)) return { success: false as const, error: "Attendance clocks need owner review before clock-out." };
      const workDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(attendance?.date ?? startOfDay);
      const workDate = new Date(workDay + "T00:00:00Z");
      if (attendance?.paid_in_payslip_id || await tx.payrollEarning.findFirst({ where: { business_id: access.actor.businessId, employee_id: input.employeeId, source_type: "WORKDAY", source_id: input.employeeId + ":" + workDay, statement: { is: { status: "PUBLISHED" } } }, select: { id: true } })) return { success: false as const, error: "Published attendance requires a reviewed correction; its original clocks stay fixed." };
      const settings = await tx.payrollSettings.findUnique({ where: { business_id: access.actor.businessId }, select: { mode: true } });
      const sessions = settings && settings.mode !== "LEGACY" ? await tx.workforceSession.findMany({ where: { business_id: access.actor.businessId, employee_id: input.employeeId, work_date: workDate }, orderBy: { started_at: "asc" }, take: 2 }) : [];
      if (sessions.length > 1 || sessions.some(session => session.confirmed_at || session.ended_at || !attendance?.time_in || session.started_at.getTime() !== attendance.time_in.getTime())) return { success: false as const, error: "Work sessions conflict with the clock record. Request owner review." };
      if (direction === "in") {
        const data = await tx.employeeAttendance.create({ data: { employee_id: input.employeeId, date: startOfDay, time_in: now, status: "PRESENT", location_verified: true, latitude: input.latitude, longitude: input.longitude } });
        if (settings && settings.mode !== "LEGACY") await tx.workforceSession.create({ data: { business_id: access.actor.businessId, employee_id: input.employeeId, work_date: workDate, started_at: now, ended_at: null, confirmed_at: null, confirmed_by: null, breaks: [] } });
        return { success: true as const, data };
      }
      if (!attendance?.time_in) throw new AttendanceWriteConflict();
      const rowWhere = { ...own, id: attendance.id, date: attendance.date, time_in: attendance.time_in, time_out: null, paid_in_payslip_id: null, revision: attendance.revision };
      const changed = await tx.employeeAttendance.updateMany({ where: rowWhere, data: { time_out: now, payroll_confirmed_at: null, payroll_confirmed_by: null, revision: { increment: 1 } } });
      if (changed.count !== 1) throw new AttendanceWriteConflict();
      if (settings && settings.mode !== "LEGACY") {
        if (sessions[0]) {
          const closed = await tx.workforceSession.updateMany({ where: { id: sessions[0].id, business_id: access.actor.businessId, employee_id: input.employeeId, revision: sessions[0].revision, ended_at: null, confirmed_at: null }, data: { ended_at: now, revision: { increment: 1 } } });
          if (closed.count !== 1) throw new AttendanceWriteConflict();
        } else await tx.workforceSession.create({ data: { business_id: access.actor.businessId, employee_id: input.employeeId, work_date: workDate, started_at: attendance.time_in, ended_at: now, confirmed_at: null, confirmed_by: null, breaks: [] } });
      }
      const data = await tx.employeeAttendance.findFirst({ where: { ...own, id: attendance.id, date: attendance.date, time_out: now } });
      if (!data) throw new AttendanceWriteConflict();
      return { success: true as const, data };
    }, transactionOptions);
    if (result.success) {
      try { await detectAndEmitFutureBookingConflicts({ businessSlug: identity.businessSlug, changedDate: getStartOfDayPH(result.data.date), trigger: "ATTENDANCE_UPDATED" }); }
      catch { try { logger.warn(`[BookingConflicts] Failed after clock-${direction}`, { employeeId: input.employeeId, businessSlug: identity.businessSlug }); } catch {} }
    }
    return result;
  } catch (error) {
    if (error instanceof AttendanceWriteConflict) return { success: false as const, error: "Already clocked out." };
    if (direction === "in" && error && typeof error === "object" && "code" in error && error.code === "P2002") return { success: false as const, error: "Already clocked in today." };
    return { success: false as const, error: `Failed to clock ${direction}` };
  }
}
export function clockInSelfServiceAttendance(identity: AttendanceIdentity, input: AttendanceClockInput) { return clockAttendance(identity, input, "in"); }
export function clockOutSelfServiceAttendance(identity: AttendanceIdentity, input: AttendanceClockInput) { return clockAttendance(identity, input, "out"); }
