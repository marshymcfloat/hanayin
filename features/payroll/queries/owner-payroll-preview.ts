import "server-only";

import { ownerPermissionMembershipWhere, type OwnerActorContext } from "@/lib/auth/owner-access";
import type { OwnerPayrollPreviewData } from "@/features/payroll/types/owner-payroll-preview";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { OwnerPermission, PayslipStatus, Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

type PayrollDb = Pick<Prisma.TransactionClient, "business" | "owner" | "employee" | "payslip">;

function currentMonthPH(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const label = `${year}-${String(month).padStart(2, "0")}`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    label,
    start: new Date(`${label}-01T00:00:00+08:00`),
    end: new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+08:00`),
  };
}

export async function getOwnerPayrollPreviewData(
  actor: OwnerActorContext,
  db: PayrollDb = prisma,
  now: Date = new Date(),
): Promise<OwnerPayrollPreviewData | null> {
  const membership = {
    id: actor.ownerId,
    business_id: actor.businessId,
    user_id: actor.userId,
    user: { role: Role.OWNER },
  };
  const business = await db.business.findFirst({
    where: {
      id: actor.businessId,
      slug: actor.businessSlug,
      owners: { some: membership },
    },
    select: { name: true, payroll_settings: { select: { mode: true, calculation_policy: true } } },
  });
  if (!business) return null;

  const permittedOwner = ownerPermissionMembershipWhere(actor, OwnerPermission.PAYROLL_MANAGE);
  const permission = await db.owner.findFirst({ where: permittedOwner, select: { id: true } });
  if (!permission) return { access: "restricted" };

  // Repeat the current permission predicate in every compensation query. A stale
  // layout/session cannot authorize a cross-tenant or revoked payroll read.
  const employeeWhere: Prisma.EmployeeWhereInput = {
    business_id: actor.businessId,
    business: { slug: actor.businessSlug, owners: { some: permittedOwner } },
    user: { role: Role.EMPLOYEE },
  };
  const payslipWhere: Prisma.PayslipWhereInput = {
    status: PayslipStatus.PAID,
    employee: employeeWhere,
  };
  const month = currentMonthPH(now);
  const releasedInMonth: Prisma.PayslipWhereInput = {
    released_at: { gte: month.start, lt: month.end },
  };

  const [employees, totals, paidPayslipsThisMonth, recentPayslips] = await Promise.all([
    db.employee.findMany({
      where: employeeWhere,
      orderBy: { user: { name: "asc" } },
      select: {
        id: true, profile: true, daily_rate: true, commission_percentage: true,
        user: { select: { name: true } },
        payslips: {
          where: { status: PayslipStatus.PAID },
          orderBy: [{ released_at: "desc" }, { ending_date: "desc" }],
          take: 1,
          select: { total_salary: true, released_at: true, ending_date: true },
        },
      },
    }),
    db.payslip.aggregate({
      where: { AND: [payslipWhere, releasedInMonth] },
      _sum: { total_salary: true },
    }),
    db.payslip.count({ where: { AND: [payslipWhere, releasedInMonth] } }),
    db.payslip.findMany({
      where: payslipWhere,
      orderBy: [{ released_at: "desc" }, { ending_date: "desc" }],
      take: 20,
      select: {
        id: true, starting_date: true, ending_date: true,
        released_at: true, total_salary: true,
        employee: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);

  return {
    access: "granted",
    businessName: business.name,
    payrollMode: business.payroll_settings?.mode ?? "LEGACY",
    calculationPolicy: business.payroll_settings?.calculation_policy ?? "SIMPLE",
    month: month.label,
    paidThisMonth: totals._sum.total_salary ?? 0,
    paidPayslipsThisMonth,
    employees: employees.map((employee) => {
      const latest = employee.payslips[0];
      return {
        id: employee.id,
        name: employee.user.name,
        profile: employee.profile,
        dailyRate: employee.daily_rate,
        commissionPercentage: employee.commission_percentage,
        lastPaidAt: latest?.released_at?.toISOString() ?? null,
        lastPaidAmount: latest?.total_salary ?? null,
      };
    }),
    recentPayslips: recentPayslips.map((payslip) => ({
      id: payslip.id,
      employeeName: payslip.employee.user.name,
      periodStart: payslip.starting_date.toISOString(),
      periodEnd: payslip.ending_date.toISOString(),
      paidAt: payslip.released_at?.toISOString() ?? null,
      amount: payslip.total_salary,
    })),
  };
}
