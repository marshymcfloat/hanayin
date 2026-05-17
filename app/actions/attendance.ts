"use server";

import { prisma } from "@/prisma/prisma";

import { AttendanceStatus } from "@/prisma/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import { requireAuth } from "@/lib/auth/guards";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";
import { logger } from "@/lib/logger";

export async function getDailyAttendance(businessId: string, date: Date) {
  try {
    const employees = await prisma.employee.findMany({
      where: { business_id: businessId },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    });

    const startOfDay = getStartOfDayPH(date);
    const endOfDay = getEndOfDayPH(date);

    const attendanceRecords = await prisma.employeeAttendance.findMany({
      where: {
        employee: { business_id: businessId },
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    const data = employees.map((emp) => {
      const record = attendanceRecords.find((r) => r.employee_id === emp.id);
      return {
        employee: emp,
        attendance: record || null,
      };
    });

    return { success: true, data };
  } catch (error) {
    console.error("Failed to fetch daily attendance:", error);
    return { success: false, error: "Failed to fetch attendance" };
  }
}

export async function updateAttendanceStatus(
  employeeId: number,
  date: Date,
  status: AttendanceStatus,
) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        business: {
          select: { slug: true },
        },
      },
    });
    if (!employee || employee.business.slug !== auth.businessSlug) {
      return { success: false, error: "Unauthorized" };
    }

    const startOfDay = getStartOfDayPH(date);
    const endOfDay = getEndOfDayPH(date);

    const existing = await prisma.employeeAttendance.findFirst({
      where: {
        employee_id: employeeId,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    if (existing) {
      await prisma.employeeAttendance.update({
        where: { id: existing.id },
        data: { status },
      });
    } else {
      await prisma.employeeAttendance.create({
        data: {
          employee_id: employeeId,
          date: startOfDay,
          status,
        },
      });
    }

    try {
      await detectAndEmitFutureBookingConflicts({
        businessId: employee.business_id,
        changedDate: startOfDay,
        trigger: "ATTENDANCE_UPDATED",
      });
    } catch (error) {
      logger.warn("[BookingConflicts] Failed after attendance status update", {
        employeeId,
        businessSlug: auth.businessSlug,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    revalidatePath("/", "layout"); // Revalidate broadly to ensure cache updates
    return { success: true };
  } catch (error) {
    console.error("Failed to update attendance status:", error);
    return { success: false, error: "Failed to update status" };
  }
}

export type AttendanceImpactBooking = {
  bookingId: number;
  scheduledAt: string | null;
  estimatedEnd: string | null;
  customerName: string | null;
  customerPhone: string | null;
  serviceNames: string[];
  totalPrice: number;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
};

/**
 * Returns the bookings that will be orphaned (lose their assigned
 * provider) if `employeeId` is marked unavailable on `date`. Drives
 * the staff-side "what breaks if I mark X absent today?" preview so
 * the manager sees the cost of the action before they take it.
 *
 * Same scope as the runtime impact: only AvailedService rows assigned
 * to this employee, on the target date, that aren't already cancelled
 * or completed. Walk-ins still in progress (SERVING) show up so the
 * manager can decide to reassign instead of marking absent.
 */
export async function previewAttendanceImpactAction(
  employeeId: number,
  date: Date,
): Promise<
  | { success: true; bookings: AttendanceImpactBooking[] }
  | { success: false; error: string }
> {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, business: { select: { slug: true } } },
    });
    if (!employee || employee.business.slug !== auth.businessSlug) {
      return { success: false, error: "Unauthorized" };
    }

    const startOfDay = getStartOfDayPH(date);
    const endOfDay = getEndOfDayPH(date);

    const affected = await prisma.availedService.findMany({
      where: {
        served_by_id: employeeId,
        status: { in: ["PENDING", "CLAIMED", "SERVING"] },
        scheduled_at: { gte: startOfDay, lte: endOfDay },
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

    // De-dupe by booking — one booking can have multiple services
    // assigned to the same employee.
    const seen = new Set<number>();
    const bookings: AttendanceImpactBooking[] = [];
    for (const row of affected) {
      if (seen.has(row.booking_id)) continue;
      seen.add(row.booking_id);
      const b = row.booking;
      bookings.push({
        bookingId: b.id,
        scheduledAt: b.scheduled_at?.toISOString() ?? null,
        estimatedEnd: b.estimated_end?.toISOString() ?? null,
        customerName: b.customer?.name ?? b.customer_label ?? null,
        customerPhone: b.customer?.phone ?? null,
        serviceNames: b.availed_services
          .map((a) => a.service?.name)
          .filter((n): n is string => !!n),
        totalPrice: b.grand_total,
        paymentStatus: b.payment_status,
      });
    }

    return { success: true, bookings };
  } catch (error) {
    console.error("Failed to preview attendance impact:", error);
    return { success: false, error: "Failed to preview impact" };
  }
}

import { unstable_cache } from "next/cache";

export async function getEmployeeAttendanceHistory(employeeId: number) {
  try {
    const getCachedHistory = unstable_cache(
      async (id: number) => {
        return await prisma.employeeAttendance.findMany({
          where: { employee_id: id },
          orderBy: { date: "desc" },
          take: 90, // Limit to last 3 months ~90 days
        });
      },
      [`attendance-history`],
      {
        revalidate: 60 * 60, // 1 hour sort of cache
        tags: [`attendance-${employeeId}`],
      },
    );

    const data = await getCachedHistory(employeeId);
    return { success: true, data };
  } catch (error) {
    console.error("Failed to fetch attendance history:", error);
    return { success: false, error: "Failed to fetch history" };
  }
}
