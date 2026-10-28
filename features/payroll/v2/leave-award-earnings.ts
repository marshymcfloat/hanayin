import "server-only";
import type { Prisma, PayrollEarning } from "@/prisma/generated/prisma/client";
import { decimal, money } from "@/features/payroll/money";
import { day } from "@/features/payroll/v2/period";
import { json } from "@/features/payroll/v2/command";
import { PayrollError } from "@/features/payroll/v2/contracts";
import { maternityAwardSchema, maternityAllocationAmounts } from "@/features/payroll/v2/leave-awards-calculation";

type Allocation = Prisma.LeaveAllocationGetPayload<{ include: { entitlement: true } }>;
export async function matureLeaveAward(tx: Prisma.TransactionClient, allocation: Allocation, statementId?: string, project = true): Promise<PayrollEarning[]> {
  const entitlement = allocation.entitlement;
  const parsed = maternityAwardSchema.safeParse(entitlement?.award);
  if (!entitlement || entitlement.business_id !== allocation.business_id || entitlement.employee_id !== allocation.employee_id || !parsed.success || allocation.benefit_code !== "MATERNITY" || !allocation.units.eq(1)) throw new PayrollError("BLOCKED", "Review the statutory leave award and employer salary differential.");
  const award = parsed.data;
  const date = allocation.work_date.toISOString().slice(0, 10);
  if (award.entitlementId !== entitlement.id || date < award.periodStart || date > award.periodEnd) throw new PayrollError("BLOCKED", "Leave falls outside the verified benefit award.");
  const rule = await tx.payrollRulePackage.findFirst({ where: { id: award.rulePackageId, content_hash: award.ruleHash, certified_at: { not: null } }, select: { id: true } });
  if (!rule) throw new PayrollError("BLOCKED", "The leave award rule package needs independent certification.");
  const sourceId = entitlement.id + ":" + allocation.id;
  const prior = await tx.payrollEarning.findMany({ where: { business_id: allocation.business_id, source_type: "LEAVE_AWARD", source_id: sourceId }, include: { statement: { select: { status: true } } } });
  if (prior.some(entry => entry.statement?.status === "PUBLISHED")) return [];
  if (prior.some(entry => entry.statement_id && entry.statement_id !== statementId && !entry.reversed_at)) throw new PayrollError("CONFLICT", "Another payroll run has reserved this leave award.");
  const ordinal = (allocation.work_date.getTime() - day(award.periodStart).getTime()) / 86400000 + 1;
  const shares = maternityAllocationAmounts(award, ordinal);
  const entries: PayrollEarning[] = [];
  for (const [part, value] of Object.entries(shares)) {
    if (decimal(value).isZero()) continue;
    const code = part === "sss" ? "MATERNITY_SSS" : "MATERNITY_DIFFERENTIAL";
    const taxable = part === "sss" ? award.sssTaxable : award.differentialTaxable;
    const snapshot = { awardId: entitlement.id, allocationId: allocation.id, workDate: date, ordinal, awardDays: award.days, sourceHash: award.sourceHash, rulePackageId: award.rulePackageId, ruleHash: award.ruleHash, funding: part === "sss" ? "SSS" : "EMPLOYER" };
    const data = { business_id: allocation.business_id, employee_id: allocation.employee_id, source_type: "LEAVE_AWARD", source_id: sourceId, source_revision: entitlement.revision, earned_on: allocation.work_date, payable_on: allocation.work_date, code, description: date + " · " + (part === "sss" ? "maternity SSS benefit" : "maternity salary differential"), amount: money(value), rate: money(value), units: decimal(1), taxable, tax_category: taxable ? "NORMAL" : "EXEMPT", is_basic: false, snapshot: json(snapshot) };
    if (project) {
      await tx.payrollEarning.updateMany({ where: { business_id: allocation.business_id, source_type: "LEAVE_AWARD", source_id: sourceId, code, source_revision: { not: entitlement.revision }, reversed_at: null, OR: [{ statement_id: null }, ...(statementId ? [{ statement_id: statementId }] : [])] }, data: { reversed_at: new Date() } });
      entries.push(await tx.payrollEarning.upsert({ where: { business_id_source_type_source_id_source_revision_code: { business_id: allocation.business_id, source_type: "LEAVE_AWARD", source_id: sourceId, source_revision: entitlement.revision, code } }, create: data, update: { amount: data.amount, snapshot: data.snapshot, reversed_at: null } }));
    } else entries.push({ ...data, id: "estimate:" + sourceId + ":" + code, snapshot: snapshot as Prisma.JsonValue, reversed_at: null, statement_id: null, created_at: allocation.work_date });
  }
  return entries;
}
