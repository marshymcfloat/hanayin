import { prisma } from "@/prisma/prisma";
import {
  AttendanceStatus,
  AvailedServiceStatus,
  BookingStatus,
  PaymentStatus,
  PayslipStatus,
} from "@/prisma/generated/prisma/client";
import { getCurrentDateTimePH, getStartOfDayPH } from "@/lib/date-utils";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { logAudit } from "@/lib/services/audit";
import { calculatePayslipCompensation, roundCurrency } from "@/features/payroll/services/payslip-policy";
import { unpaidLegacyLeave } from "@/features/payroll/services/legacy-leave-pay";

// Eligibility filters that decide which rows count toward a payslip.
// Keeping these in one place so preview (getPayslipDataAction) and
// commit (createPayslipAction) cannot drift.
function eligibleAttendanceWhere(
  employeeId: number,
  businessSlug: string,
): Prisma.EmployeeAttendanceWhereInput {
  return {
    employee_id: employeeId,
    employee: { business: { slug: businessSlug } },
    paid_in_payslip_id: null,
    date: { lte: getCurrentDateTimePH() },
    OR: [
      { status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] } },
      { status: AttendanceStatus.LEAVE, is_paid_leave: true },
    ],
  };
}

function eligibleServiceWhere(
  employeeId: number,
  businessSlug: string,
): Prisma.AvailedServiceWhereInput {
  return {
    served_by_id: employeeId,
    status: AvailedServiceStatus.COMPLETED,
    cancelled_at: null,
    paid_in_payslip_id: null,
    completed_at: { lte: getCurrentDateTimePH() },
    booking: {
      business: { slug: businessSlug },
      status: { not: BookingStatus.CANCELLED },
      payment_status: PaymentStatus.PAID,
    },
  };
}

// Same logic for the *display* lower-bound of a period. Selection itself is
// driven by paid_in_payslip_id (so retroactive edits can't slip through), but
// the UI still wants a human-readable "from" date.
async function resolveDisplayStart(
  employeeId: number,
  businessSlug: string,
  fallback: Date,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Date> {
  const lastReleased = await client.payslip.findFirst({
    where: { employee_id: employeeId, employee: { business: { slug: businessSlug } }, status: PayslipStatus.PAID },
    orderBy: [{ released_at: "desc" }, { ending_date: "desc" }],
    select: { released_at: true, ending_date: true },
  });
  return lastReleased?.released_at ?? lastReleased?.ending_date ?? fallback;
}

export async function getPayslipPreview(employeeId: number, businessSlug: string) {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, business: { slug: businessSlug } },
      include: {
        user: { select: { name: true, created_at: true } },
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
      businessSlug,
      new Date(getStartOfDayPH(employee.user.created_at).getTime() - 1),
    );
    const endingDate = getCurrentDateTimePH();

    const attendanceRecords = await prisma.employeeAttendance.findMany({
      where: eligibleAttendanceWhere(employeeId, businessSlug),
      orderBy: { date: "asc" },
    });

    const commissionServices = await prisma.availedService.findMany({
      where: eligibleServiceWhere(employeeId, businessSlug),
      select: {
        id: true,
        commission_base: true,
        payroll_commission_rate: true,
        price: true,
        completed_at: true,
        package_id: true,
        package: { select: { name: true } },
        service: { select: { name: true } },
        booking: {
          select: {
            customer_label: true,
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { completed_at: "asc" },
    });

    const leave = await unpaidLegacyLeave(employeeId, businessSlug, endingDate);
    const { daysPresent, paidLeaveDays, basicSalary, commissionTotal, grossSalary, uniqueAttendance } = calculatePayslipCompensation(
      [...attendanceRecords, ...leave.attendance], commissionServices, employee.daily_rate, employee.commission_percentage,
    );

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
          attendance_dates: uniqueAttendance.map((r) => r.date),
          basic_salary: roundCurrency(basicSalary),
          commission_services_count: commissionServices.length,
          commission_services: commissionServices.map(service => ({ ...service, payroll_commission_rate: service.payroll_commission_rate?.toString() ?? null })),
          commission_total: roundCurrency(commissionTotal),
        },
        total_salary: roundCurrency(grossSalary),
      },
    };
  } catch (error) {
    console.error("Error calculating payslip:", error);
    return { success: false, error: "Failed to calculate payslip" };
  }
}

export async function createPayslip(data: {
  employeeId: number;
  deduction?: number;
  comment?: string;
}, context: { businessSlug: string; actorId: string }) {
  const { businessSlug, actorId } = context;
  const employee = await prisma.employee.findFirst({
    where: { id: data.employeeId, business: { slug: businessSlug } },
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
      const owner = await tx.owner.findFirst({ where: { user_id: actorId, business_id: employee.business_id, user: { role: "OWNER" }, permissions: { has: "PAYROLL_MANAGE" } }, select: { id: true } });
      if (!owner) throw new Error("PAYROLL_ACCESS_REVOKED");
      const settings = await tx.payrollSettings.findUnique({ where: { business_id: employee.business_id }, select: { mode: true } });
      if (settings?.mode === "ACTIVE") throw new Error("PAYROLL_LEGACY_DISABLED");
      const startingDate = await resolveDisplayStart(
        data.employeeId,
        businessSlug,
        new Date(getStartOfDayPH(employee.user.created_at).getTime() - 1),
        tx,
      );
      const releasedAt = getCurrentDateTimePH();

      // Re-fetch eligible rows INSIDE the transaction so the totals can never
      // drift from what we actually stamp.
      const attendance = await tx.employeeAttendance.findMany({
        where: eligibleAttendanceWhere(data.employeeId, businessSlug),
      });

      const services = await tx.availedService.findMany({
        where: eligibleServiceWhere(data.employeeId, businessSlug),
        select: {
          id: true,
          commission_base: true,
          payroll_commission_rate: true,
          price: true,
        },
      });

      const leave = await unpaidLegacyLeave(data.employeeId, businessSlug, releasedAt, tx);
      const { daysPresent, paidLeaveDays, basicSalary, commissionTotal, grossSalary, deduction, netSalary } = calculatePayslipCompensation(
        [...attendance, ...leave.attendance], services, employee.daily_rate, employee.commission_percentage, requestedDeduction,
      );

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

      // Audit the creation inside the same txn so either both land or neither does.
      // changes.after captures the exact released amounts for forensic replay.
      await logAudit(tx, {
        entityType: "Payslip",
        entityId: String(payslip.id),
        action: "CREATED",
        actorId,
        businessId: employee.business_id,
        changes: {
          after: {
            employee_id: data.employeeId,
            starting_date: startingDate.toISOString(),
            ending_date: releasedAt.toISOString(),
            released_at: releasedAt.toISOString(),
            days_present: daysPresent,
            paid_leave_days: paidLeaveDays,
            basic_salary: roundCurrency(basicSalary),
            commission_total: roundCurrency(commissionTotal),
            gross_salary: roundCurrency(grossSalary),
            deduction: roundCurrency(deduction),
            net_salary: roundCurrency(netSalary),
            comment: data.comment ?? null,
            attendance_count: attendance.length,
            services_count: services.length,
          },
        },
      });

      if (attendance.length > 0) {
        const stamped = await tx.employeeAttendance.updateMany({
          where: {
            id: { in: attendance.map((a) => a.id) },
            employee_id: data.employeeId,
            employee: { business: { slug: businessSlug } },
            paid_in_payslip_id: null,
          },
          data: { paid_in_payslip_id: payslip.id },
        });
        if (stamped.count !== attendance.length) {
          throw new Error("PAYSLIP_STALE_SELECTION");
        }
      }

      if (services.length > 0) {
        const stamped = await tx.availedService.updateMany({
          where: {
            id: { in: services.map((s) => s.id) },
            served_by_id: data.employeeId,
            booking: { business: { slug: businessSlug } },
            paid_in_payslip_id: null,
          },
          data: { paid_in_payslip_id: payslip.id },
        });
        if (stamped.count !== services.length) {
          throw new Error("PAYSLIP_STALE_SELECTION");
        }
      }
      if (leave.allocations.length) {
        const stamped = await tx.leaveAllocation.updateMany({ where: { id: { in: leave.allocations.map(entry => entry.id) }, employee_id: data.employeeId, paid_in_payslip_id: null }, data: { paid_in_payslip_id: payslip.id } });
        if (stamped.count !== leave.allocations.length) throw new Error("PAYSLIP_STALE_SELECTION");
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
    }, { isolationLevel: "Serializable" });
    return { success: true, data: result };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "PAYROLL_ACCESS_REVOKED") return { success: false, error: "Forbidden" };
    if (error instanceof Error && error.message === "PAYROLL_LEGACY_DISABLED") return { success: false, error: "Use the period-based payroll workflow for this business." };
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      return { success: false, error: "Payroll records changed. Refresh and try again." };
    }
    if (error instanceof Error && error.message === "PAYSLIP_STALE_SELECTION") {
      return { success: false, error: "Payroll records changed. Refresh and try again." };
    }
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

// Returns all AuditLog entries for every payslip owned by the given
// employee. Payroll-authorized owners and the employee themselves can view.
// Tenant-scoped:
// always filters on the caller's business_id so cross-tenant id
// collisions can't leak data.
export async function getEmployeePayslipAudit(employeeId: number, businessSlug: string) {
  const target = await prisma.employee.findFirst({
    where: { id: employeeId, business: { slug: businessSlug } },
    select: {
      id: true,
      business_id: true,
      payslips: { select: { id: true }, orderBy: { id: "desc" } },
    },
  });
  if (!target) return { success: false, error: "Employee not found" };

  const payslipIds = target.payslips.map((p) => String(p.id));
  if (payslipIds.length === 0) {
    return { success: true, data: [] as Array<never> };
  }

  const rows = await prisma.auditLog.findMany({
    where: {
      entity_type: "Payslip",
      entity_id: { in: payslipIds },
      business_id: target.business_id,
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  return {
    success: true,
    data: rows.map((row) => ({
      id: row.id,
      payslipId: row.entity_id,
      action: row.action,
      actorId: row.actor_id,
      changes: (row.changes as Record<string, unknown> | null) ?? null,
      createdAt: row.created_at.toISOString(),
    })),
  };
}

export async function getPayslipHistory(employeeId: number, businessSlug: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, business: { slug: businessSlug } },
    select: { business: { select: { slug: true } } },
  });
  if (!employee || employee.business.slug !== businessSlug) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const payslips = await prisma.payslip.findMany({
      where: { employee_id: employeeId, employee: { business: { slug: businessSlug } } },
      orderBy: { ending_date: "desc" },
    });
    return { success: true, data: payslips };
  } catch (error) {
    console.error("Error fetching payslip history:", error);
    return { success: false, error: "Failed to fetch payslip history" };
  }
}

export async function getPayrollCallerEmployee(userId: string, businessSlug: string) {
  return prisma.employee.findFirst({
    where: { user_id: userId, business: { slug: businessSlug } },
    select: { id: true, profile: true },
  });
}
