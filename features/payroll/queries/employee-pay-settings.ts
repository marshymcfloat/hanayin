import "server-only";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { payrollOwner } from "@/features/payroll/v2/access";
import { PayrollError, type PayrollIdentity } from "@/features/payroll/v2/contracts";
import type { EmployeePaySettings } from "@/features/payroll/pay-settings";

export async function employeePaySettings(identity: PayrollIdentity, employeeId: number, db: Prisma.TransactionClient = prisma): Promise<EmployeePaySettings> {
  const actor = await payrollOwner(identity, db);
  const membership = { owners: { some: { id: actor.ownerId, user_id: actor.userId, user: { role: "OWNER" as const }, permissions: { has: "PAYROLL_MANAGE" as const } } } };
  const employee = await db.employee.findFirst({
    where: { id: employeeId, business_id: actor.businessId, archived_at: null, user: { role: "EMPLOYEE", owner: { is: null } }, business: membership },
    select: { id: true, financial_revision: true, employment_start: true, employment_end: true, daily_rate: true, commission_percentage: true, user: { select: { name: true } }, business: { select: { payroll_settings: { select: { mode: true, calculation_policy: true } } } }, compensation_agreements: { orderBy: { effective_from: "desc" }, select: { id: true, effective_from: true, effective_to: true, basis: true, rate: true, normal_hours: true, commission_rate: true, commission_basis: true, monthly_divisor: true } } },
  });
  if (!employee) throw new PayrollError("NOT_FOUND", "This person's pay settings are unavailable. Refresh People and try again.");
  await payrollOwner(identity, db);
  return {
    policy: employee.business.payroll_settings?.calculation_policy ?? "SIMPLE", mode: employee.business.payroll_settings?.mode ?? "LEGACY",
    legacy: { dailyRate: String(employee.daily_rate), commissionRate: String(employee.commission_percentage) },
    employee: { id: employee.id, name: employee.user.name, revision: employee.financial_revision, employmentStart: employee.employment_start?.toISOString().slice(0, 10) ?? null, employmentEnd: employee.employment_end?.toISOString().slice(0, 10) ?? null, agreements: employee.compensation_agreements.map(entry => ({ id: entry.id, from: entry.effective_from.toISOString().slice(0, 10), to: entry.effective_to?.toISOString().slice(0, 10) ?? null, basis: entry.basis, rate: entry.rate.toString(), hours: entry.normal_hours.toString(), commissionRate: entry.commission_rate.toString(), commissionBasis: entry.commission_basis, monthlyDivisor: entry.monthly_divisor?.toString() ?? null })) },
  };
}
