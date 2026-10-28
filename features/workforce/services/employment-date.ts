import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";

type Employee = { id: number; employment_start: Date | null; employment_end: Date | null; financial_revision: number };

export async function employmentDateChangeError(tx: Prisma.TransactionClient, businessId: string, employee: Employee, next: string | null, expectedRevision?: number): Promise<string | null> {
  if (expectedRevision !== employee.financial_revision) return "Employee records changed. Refresh People before changing Joined on.";
  const date = next ? new Date(next + "T00:00:00Z") : null;
  if (date && employee.employment_end && date > employee.employment_end) return "Joined on must be on or before the recorded employment end date.";
  const [published, legacy] = await Promise.all([
    tx.payrollStatement.findFirst({ where: { business_id: businessId, employee_id: employee.id, status: "PUBLISHED" }, select: { id: true } }),
    tx.payslip.findFirst({ where: { employee_id: employee.id, employee: { business_id: businessId } }, select: { id: true } }),
  ]);
  if ((published || legacy) && (employee.employment_start || !date)) return "Joined on is linked to saved payroll. A reviewed correction is required; saved payslips are unchanged.";
  const phDate = next ? new Date(next + "T00:00:00+08:00") : null;
  const [agreement, earning, attendance, session, earlierLegacy] = await Promise.all([
    tx.compensationAgreement.findFirst({ where: { business_id: businessId, employee_id: employee.id, ...(date ? { effective_from: { lt: date } } : {}) }, select: { id: true } }),
    tx.payrollEarning.findFirst({ where: { business_id: businessId, employee_id: employee.id, ...(date ? { earned_on: { lt: date } } : {}) }, select: { id: true } }),
    tx.employeeAttendance.findFirst({ where: { employee_id: employee.id, employee: { business_id: businessId }, ...(phDate ? { date: { lt: phDate } } : {}) }, select: { id: true } }),
    tx.workforceSession.findFirst({ where: { business_id: businessId, employee_id: employee.id, ...(date ? { work_date: { lt: date } } : {}) }, select: { id: true } }),
    date && legacy ? tx.payslip.findFirst({ where: { employee_id: employee.id, employee: { business_id: businessId }, ending_date: { lt: phDate! } }, select: { id: true } }) : null,
  ]);
  if (agreement || earning || attendance || session || earlierLegacy) return date ? "Joined on cannot be later than recorded work or pay terms. Review the existing records first." : "Joined on cannot be cleared while work or pay records exist.";
  return null;
}
