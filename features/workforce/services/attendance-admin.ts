import type { AttendanceStatus } from "@/prisma/generated/prisma/enums";
import { getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";
import { logger } from "@/lib/logger";
import { prisma } from "@/prisma/prisma";
import type { AttendanceImpactBooking } from "@/features/workforce/types/attendance";
import { currentWorkforceOwner } from "@/features/workforce/workforce-access";

async function findTenantEmployee(businessSlug: string, employeeId: number) {
  return prisma.employee.findFirst({
    where: { id: employeeId, business: { slug: businessSlug } },
    select: { id: true, business_id: true },
  });
}

export async function updateTenantAttendanceStatus(
  businessSlug: string,
  employeeId: number,
  date: Date,
  status: AttendanceStatus,
  actorId?: string,
) {
  if (!actorId) return { success: false as const, error: "Forbidden" };
  const employee = await findTenantEmployee(businessSlug, employeeId);
  if (!employee) return { success: false as const, error: "Unauthorized" };

  const attendanceDate = getStartOfDayPH(date);
  try {
    await prisma.$transaction(async tx => {
      const owner = await currentWorkforceOwner(businessSlug, actorId, tx);
      if (!owner || owner.business_id !== employee.business_id) throw new Error("WORKFORCE_FORBIDDEN");
      const existing = await tx.employeeAttendance.findUnique({ where: { employee_id_date: { employee_id: employeeId, date: attendanceDate } } });
      if (existing?.paid_in_payslip_id || await tx.payrollEarning.findFirst({ where: { business_id: employee.business_id, employee_id: employeeId, source_type: "WORKDAY", earned_on: new Date(attendanceDate.getTime() + 8 * 3600000), statement: { is: { status: "PUBLISHED" } } }, select: { id: true } })) throw new Error("WORKFORCE_PAID");
      const data = { status, is_paid_leave: status === "LEAVE" && Boolean(existing?.is_paid_leave), payroll_confirmed_at: new Date(), payroll_confirmed_by: actorId };
      const after = await tx.employeeAttendance.upsert({ where: { employee_id_date: { employee_id: employeeId, date: attendanceDate } }, update: { ...data, revision: { increment: 1 } }, create: { ...data, employee_id: employeeId, date: attendanceDate, revision: 1 } });
      await tx.attendanceRevision.create({ data: { business_id: employee.business_id, employee_id: employeeId, work_date: new Date(attendanceDate.getTime() + 8 * 3600000), before: JSON.parse(JSON.stringify(existing ?? {})), after: JSON.parse(JSON.stringify(after)), reason: "Owner confirmed attendance status: " + status, actor_id: actorId, command_key: crypto.randomUUID() } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Error && error.message === "WORKFORCE_FORBIDDEN") return { success: false as const, error: "Forbidden" };
    if (error instanceof Error && error.message === "WORKFORCE_PAID") return { success: false as const, error: "Paid work requires a payroll adjustment." };
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return {
        success: false as const,
        error: "Another change landed at the same time. Refresh and try again.",
      };
    }
    throw error;
  }

  try {
    await detectAndEmitFutureBookingConflicts({
      businessId: employee.business_id,
      changedDate: attendanceDate,
      trigger: "ATTENDANCE_UPDATED",
    });
  } catch (error) {
    logger.warn("[BookingConflicts] Failed after attendance status update", {
      employeeId,
      businessSlug,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { success: true as const };
}

export async function previewTenantAttendanceImpact(
  businessSlug: string,
  employeeId: number,
  date: Date,
) {
  const employee = await findTenantEmployee(businessSlug, employeeId);
  if (!employee) return null;

  const affected = await prisma.availedService.findMany({
    where: {
      served_by_id: employee.id,
      served_by: { business_id: employee.business_id },
      status: { in: ["PENDING", "CLAIMED", "SERVING"] },
      scheduled_at: {
        gte: getStartOfDayPH(date),
        lte: getEndOfDayPH(date),
      },
      booking: { status: { not: "CANCELLED" } },
    },
    select: {
      booking_id: true,
      booking: {
        select: {
          id: true,
          scheduled_at: true,
          estimated_end: true,
          grand_total: true,
          payment_status: true,
          customer_label: true,
          customer: { select: { name: true, phone: true } },
          availed_services: {
            where: { status: { not: "CANCELLED" } },
            select: { service: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { scheduled_at: "asc" },
  });

  const seen = new Set<number>();
  const bookings: AttendanceImpactBooking[] = [];
  for (const row of affected) {
    if (seen.has(row.booking_id)) continue;
    seen.add(row.booking_id);
    const booking = row.booking;
    bookings.push({
      bookingId: booking.id,
      scheduledAt: booking.scheduled_at?.toISOString() ?? null,
      estimatedEnd: booking.estimated_end?.toISOString() ?? null,
      customerName: booking.customer?.name ?? booking.customer_label ?? null,
      customerPhone: booking.customer?.phone ?? null,
      serviceNames: booking.availed_services
        .map((item) => item.service?.name)
        .filter((name): name is string => Boolean(name)),
      totalPrice: booking.grand_total,
      paymentStatus: booking.payment_status,
    });
  }

  return bookings;
}
