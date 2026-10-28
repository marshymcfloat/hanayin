import "server-only";
import { z } from "zod";
import { prisma } from "@/prisma/prisma";
import { runWorkforcePayrollCommand, assertPayrollRevision, payrollDecimal, payrollDate, PayrollError, type PayrollIdentity } from "@/features/payroll/public";

export const grantLeaveEntitlementSchema = z.object({
  key: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), employeeId: z.number().int().positive(),
  benefitCode: z.enum(["SIL", "MATERNITY", "PATERNITY", "SOLO_PARENT", "VAWC", "SPECIAL_WOMEN"]),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  units: z.string().regex(/^\d{1,3}(\.\d{1,3})?$/).refine(value => Number(value) > 0),
  funding: z.enum(["EMPLOYER", "SSS", "EMPLOYER_DIFFERENTIAL"]),
  evidence: z.string().trim().min(10).max(1000),
}).refine(value => value.periodEnd >= value.periodStart);
export async function grantLeaveEntitlement(identity: PayrollIdentity, input: z.infer<typeof grantLeaveEntitlementSchema>) {
  return runWorkforcePayrollCommand(identity, "LEAVE_ENTITLEMENT", input, async (tx, actor) => {
    const employee = await tx.employee.findFirst({ where: { id: input.employeeId, business_id: actor.businessId, archived_at: null }, select: { id: true, financial_revision: true, employment_start: true } });
    if (!employee) throw new PayrollError("NOT_FOUND", "Employee not found.");
    assertPayrollRevision(employee.financial_revision, input.expectedRevision);
    if (!employee.employment_start) throw new PayrollError("BLOCKED", "Confirm the employment start date before statutory leave.");
    const anniversary = new Date(employee.employment_start); anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    if (input.benefitCode === "SIL" && payrollDate(input.periodStart) < anniversary) throw new PayrollError("BLOCKED", "Service incentive leave requires verified qualifying service.");
    const existing = await tx.leaveEntitlement.findUnique({ where: { employee_id_benefit_code_period_start: { employee_id: employee.id, benefit_code: input.benefitCode, period_start: payrollDate(input.periodStart) } } });
    if (existing) throw new PayrollError("CONFLICT", "This benefit period already has a recorded entitlement.");
    const record = await tx.leaveEntitlement.create({ data: { business_id: actor.businessId, employee_id: employee.id, benefit_code: input.benefitCode, period_start: payrollDate(input.periodStart), period_end: payrollDate(input.periodEnd), granted_units: payrollDecimal(input.units), funding: input.funding, evidence: input.evidence } });
    await tx.employee.update({ where: { id: employee.id }, data: { financial_revision: { increment: 1 } } });
    return { id: record.id };
  }, "WORKFORCE_MANAGE");
}
export async function leaveEntitlementReview(identity: PayrollIdentity) {
  const owner = await prisma.owner.findFirst({ where: { user_id: identity.userId, user: { role: "OWNER" }, business: { slug: identity.businessSlug }, permissions: { has: "WORKFORCE_MANAGE" } }, select: { business_id: true } });
  if (!owner) throw new PayrollError("FORBIDDEN", "Forbidden");
  const records = await prisma.leaveEntitlement.findMany({ where: { business_id: owner.business_id }, include: { employee: { select: { user: { select: { name: true } } } }, allocations: { where: { cancelled_at: null }, select: { units: true } } }, orderBy: { period_start: "desc" }, take: 100 });
  return records.map(entry => ({ id: entry.id, employeeName: entry.employee.user.name, benefitCode: entry.benefit_code, start: entry.period_start.toISOString().slice(0, 10), end: entry.period_end.toISOString().slice(0, 10), granted: entry.granted_units.toString(), remaining: entry.allocations.reduce((value, allocation) => value.minus(allocation.units), entry.granted_units.minus(entry.converted_units)).toString(), funding: entry.funding }));
}
