"use server";

import { prisma } from "@/prisma/prisma";
import {
  AttendanceStatus,
  AvailedServiceStatus,
  BookingStatus,
  PaymentStatus,
  PayslipStatus,
} from "@/prisma/generated/prisma/client";
import { getCurrentDateTimePH, getStartOfDayPH } from "@/lib/date-utils";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { Role } from "@/prisma/generated/prisma/enums";
import type { Prisma } from "@/prisma/generated/prisma/client";

// Eligibility filters that decide which rows count toward a payslip.
// Keeping these in one place so preview (getPayslipDataAction) and
// commit (createPayslipAction) cannot drift.
function eligibleAttendanceWhere(
  employeeId: number,
): Prisma.EmployeeAttendanceWhereInput {
  return {
    employee_id: employeeId,
    paid_in_payslip_id: null,
    OR: [
      { status: AttendanceStatus.PRESENT },
      { status: AttendanceStatus.LEAVE, is_paid_leave: true },
    ],
  };
}

function eligibleServiceWhere(
  employeeId: number,
): Prisma.AvailedServiceWhereInput {
  return {
    served_by_id: employeeId,
    status: AvailedServiceStatus.COMPLETED,
    cancelled_at: null,
    paid_in_payslip_id: null,
    booking: {
      status: { not: BookingStatus.CANCELLED },
      payment_status: PaymentStatus.PAID,
    },
  };
}

// Round to two decimals for currency storage. Float math is fine for display
// but we don't want cumulative drift saved to the DB.
function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

// Same logic for the *display* lower-bound of a period. Selection itself is
// driven by paid_in_payslip_id (so retroactive edits can't slip through), but
// the UI still wants a human-readable "from" date.
async function resolveDisplayStart(
  employeeId: number,
  fallback: Date,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Date> {
  const lastReleased = await client.payslip.findFirst({
    where: { employee_id: employeeId, status: PayslipStatus.PAID },
    orderBy: [{ released_at: "desc" }, { ending_date: "desc" }],
    select: { released_at: true, ending_date: true },
  });
  return lastReleased?.released_at ?? lastReleased?.ending_date ?? fallback;
}

export async function getPayslipDataAction(employeeId: number) {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const { session, businessSlug } = auth;

  if (session.user.role === Role.EMPLOYEE) {
    const userEmployee = await prisma.employee.findUnique({
      where: { user_id: session.user.id },
    });
    if (!userEmployee || userEmployee.id !== employeeId) {
      return {
        success: false,
        error: "Unauthorized: You can only view your own payslips.",
      };
    }
  }

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: true,
        business: { select: { slug: true } },
      },
    });

    if (!employee) throw new Error("Employee not found");

    if (employee.business.slug !== businessSlug) {
      return {
        success: false,
        error: "Unauthorized: Employee belongs to another business.",
      };
    }

    const startingDate = await resolveDisplayStart(
      employeeId,
      new Date(getStartOfDayPH(employee.user.created_at).getTime() - 1),
    );
    const endingDate = getCurrentDateTimePH();

    const attendanceRecords = await prisma.employeeAttendance.findMany({
      where: eligibleAttendanceWhere(employeeId),
      orderBy: { date: "asc" },
    });

    const daysPresent = attendanceRecords.filter(
      (r) => r.status === AttendanceStatus.PRESENT,
    ).length;
    const paidLeaveDays = attendanceRecords.filter(
      (r) => r.status === AttendanceStatus.LEAVE && r.is_paid_leave,
    ).length;

    const basicSalary = (daysPresent + paidLeaveDays) * employee.daily_rate;

    const commissionServices = await prisma.availedService.findMany({
      where: eligibleServiceWhere(employeeId),
      select: {
        id: true,
        commission_base: true,
        price: true,
        completed_at: true,
        package_id: true,
        package: { select: { name: true } },
        service: { select: { name: true } },
      },
      orderBy: { completed_at: "asc" },
    });

    const commissionTotal = commissionServices.reduce((sum, s) => {
      const base = s.commission_base ?? s.price;
      return sum + (base * employee.commission_percentage) / 100;
    }, 0);

    const totalSalary = basicSalary + commissionTotal;

    return {
      success: true,
      data: {
        employee: {
          id: employee.id,
          name: employee.user.name,
          daily_rate: employee.daily_rate,
          commission_percentage: employee.commission_percentage,
        },
        period: {
          start: startingDate,
          end: endingDate,
        },
        breakdown: {
          days_present: daysPresent,
          paid_leave_days: paidLeaveDays,
          attendance_dates: attendanceRecords.map((r) => r.date),
          basic_salary: roundCurrency(basicSalary),
          commission_services_count: commissionServices.length,
          commission_services: commissionServices,
          commission_total: roundCurrency(commissionTotal),
        },
        total_salary: roundCurrency(totalSalary),
      },
    };
  } catch (error) {
    console.error("Error calculating payslip:", error);
    return { success: false, error: "Failed to calculate payslip" };
  }
}

export async function createPayslipAction(data: {
  employeeId: number;
  deduction?: number;
  comment?: string;
}) {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  const { session, businessSlug } = auth;

  if (session.user.role !== Role.OWNER) {
    return {
      success: false,
      error: "Unauthorized: Only owners can create payslips.",
    };
  }

  const employee = await prisma.employee.findUnique({
    where: { id: data.employeeId },
    include: {
      user: { select: { created_at: true } },
      business: { select: { slug: true } },
    },
  });

  if (!employee || employee.business.slug !== businessSlug) {
    return {
      success: false,
      error: "Unauthorized operation on employee from another business.",
    };
  }

  const requestedDeduction =
    typeof data.deduction === "number" && Number.isFinite(data.deduction)
      ? Math.max(0, data.deduction)
      : 0;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const startingDate = await resolveDisplayStart(
        data.employeeId,
        new Date(getStartOfDayPH(employee.user.created_at).getTime() - 1),
        tx,
      );
      const releasedAt = getCurrentDateTimePH();

      // Re-fetch eligible rows INSIDE the transaction so the totals can never
      // drift from what we actually stamp.
      const attendance = await tx.employeeAttendance.findMany({
        where: eligibleAttendanceWhere(data.employeeId),
      });

      const services = await tx.availedService.findMany({
        where: eligibleServiceWhere(data.employeeId),
        select: {
          id: true,
          commission_base: true,
          price: true,
        },
      });

      // Belt-and-braces: even with the unique (employee_id, date) constraint
      // about to land, dedupe in-memory in case of legacy data still in flight.
      const seenDates = new Set<string>();
      const uniqueAttendance = attendance.filter((a) => {
        const key = a.date.toISOString().slice(0, 10);
        if (seenDates.has(key)) return false;
        seenDates.add(key);
        return true;
      });

      const daysPresent = uniqueAttendance.filter(
        (r) => r.status === AttendanceStatus.PRESENT,
      ).length;
      const paidLeaveDays = uniqueAttendance.filter(
        (r) => r.status === AttendanceStatus.LEAVE && r.is_paid_leave,
      ).length;

      const basicSalary =
        (daysPresent + paidLeaveDays) * employee.daily_rate;

      const commissionTotal = services.reduce((sum, s) => {
        const base = s.commission_base ?? s.price;
        return sum + (base * employee.commission_percentage) / 100;
      }, 0);

      const grossSalary = basicSalary + commissionTotal;
      // Cap deduction at gross so a user can't underpay below zero.
      const deduction = Math.min(grossSalary, requestedDeduction);
      const netSalary = grossSalary - deduction;

      const payslip = await tx.payslip.create({
        data: {
          employee_id: data.employeeId,
          starting_date: startingDate,
          ending_date: releasedAt,
          released_at: releasedAt,
          total_salary: roundCurrency(netSalary),
          deduction: roundCurrency(deduction),
          comment: data.comment,
          status: PayslipStatus.PAID,
        },
      });

      if (uniqueAttendance.length > 0) {
        await tx.employeeAttendance.updateMany({
          where: {
            id: { in: uniqueAttendance.map((a) => a.id) },
            paid_in_payslip_id: null,
          },
          data: { paid_in_payslip_id: payslip.id },
        });
      }

      if (services.length > 0) {
        await tx.availedService.updateMany({
          where: {
            id: { in: services.map((s) => s.id) },
            paid_in_payslip_id: null,
          },
          data: { paid_in_payslip_id: payslip.id },
        });
      }

      return {
        payslip,
        breakdown: {
          days_present: daysPresent,
          paid_leave_days: paidLeaveDays,
          basic_salary: roundCurrency(basicSalary),
          commission_total: roundCurrency(commissionTotal),
          gross_salary: roundCurrency(grossSalary),
          deduction: roundCurrency(deduction),
          net_salary: roundCurrency(netSalary),
        },
      };
    });

    revalidatePath(`/app/${businessSlug}/payroll`);
    return { success: true, data: result };
  } catch (error: unknown) {
    // P2002 = unique constraint violation. Means a payslip already exists for
    // this exact (employee, starting_date, ending_date) — i.e. someone double-clicked.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return {
        success: false,
        error:
          "A payslip for this period already exists. Refresh and try again.",
      };
    }
    console.error("Error creating payslip:", error);
    return { success: false, error: "Failed to create payslip" };
  }
}

export async function getPayslipHistoryAction(employeeId: number) {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const { session, businessSlug } = auth;

  if (session.user.role === Role.EMPLOYEE) {
    const userEmployee = await prisma.employee.findUnique({
      where: { user_id: session.user.id },
    });
    if (!userEmployee || userEmployee.id !== employeeId) {
      return { success: false, error: "Unauthorized" };
    }
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { business: { select: { slug: true } } },
  });
  if (!employee || employee.business.slug !== businessSlug) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const payslips = await prisma.payslip.findMany({
      where: { employee_id: employeeId },
      orderBy: { ending_date: "desc" },
    });
    return { success: true, data: payslips };
  } catch (error) {
    console.error("Error fetching payslip history:", error);
    return { success: false, error: "Failed to fetch payslip history" };
  }
}
