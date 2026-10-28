import "server-only";
import { z } from "zod";
import { prisma } from "@/prisma/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { PayrollError, type PayrollIdentity } from "@/features/payroll/v2/contracts";
import { payrollOwner } from "@/features/payroll/v2/access";
import { fingerprint, json, payrollCommand, stale } from "@/features/payroll/v2/command";
import { commandEnvelope } from "@/features/payroll/v2/schemas";
import { day, phDay } from "@/features/payroll/v2/period";
import { eligibilityAt } from "@/features/payroll/v2/profile-history";
import { calculateMaternityAward, maternityInputSchema, maternityRulesSchema, type MaternityInput } from "@/features/payroll/v2/leave-awards-calculation";

export const maternityAwardCommandSchema = commandEnvelope.extend(maternityInputSchema.shape).extend({ expectedHash: z.string().regex(/^[a-f0-9]{64}$/) });
async function candidate(tx: Prisma.TransactionClient, businessId: string, input: MaternityInput) {
  if (input.contingencyDate > phDay(new Date())) throw new PayrollError("BLOCKED", "Confirm the actual maternity event before recording a verified award.");
  const entitlement = await tx.leaveEntitlement.findFirst({ where: { id: input.entitlementId, business_id: businessId, benefit_code: "MATERNITY" }, include: { employee: { include: { payroll_profile: true, compensation_agreements: true } }, allocations: { where: { cancelled_at: null } } } });
  const settings = await tx.payrollSettings.findUnique({ where: { business_id: businessId }, include: { rule_package: true } });
  if (settings?.calculation_policy === "SIMPLE") throw new PayrollError("BLOCKED", "Automatic maternity awards require government-calculation setup. Record externally calculated amounts as named manual additions.");
  if (!entitlement || entitlement.employee.archived_at) throw new PayrollError("NOT_FOUND", "Maternity entitlement unavailable.");
  if (!settings?.rule_package?.certified_at || settings.mode === "LEGACY") throw new PayrollError("BLOCKED", "A certified rule package and payroll shadow or active mode are required.");
  if (settings.rule_package.effective_from > day(input.contingencyDate) || settings.rule_package.supported_through < day(input.contingencyDate)) throw new PayrollError("BLOCKED", "Certified maternity rules do not cover this event date.");
  const rules = maternityRulesSchema.safeParse((settings.rule_package.rules as Record<string, unknown>).maternity);
  if (!rules.success) throw new PayrollError("BLOCKED", "This rule package does not include independently reviewed maternity calculations.");
  const profile = entitlement.employee.payroll_profile;
  if (!profile || !eligibilityAt(profile.eligibility_history, input.contingencyDate)?.eligibility.sss) throw new PayrollError("BLOCKED", "Verify SSS eligibility and employment records for the maternity event.");
  if (!entitlement.employee.employment_start || entitlement.employee.employment_start > day(input.contingencyDate) || (entitlement.employee.employment_end && entitlement.employee.employment_end < day(input.contingencyDate))) throw new PayrollError("BLOCKED", "Separated or unverified employment maternity cases require independent review.");
  if (entitlement.award) throw new PayrollError("BLOCKED", "This entitlement already has a reviewed award. Preserve it and record a linked adjustment for corrections.");
  const award = calculateMaternityAward(input, rules.data);
  if (!entitlement.granted_units.eq(award.days) || entitlement.period_end.getTime() - entitlement.period_start.getTime() !== (award.days - 1) * 86400000 || entitlement.period_start > day(input.contingencyDate) || entitlement.period_end < day(input.contingencyDate)) throw new PayrollError("BLOCKED", "The entitlement must identify the exact consecutive covered calendar days, duration, and maternity event.");
  if (entitlement.allocations.some(entry => !entry.units.eq(1) || entry.paid_in_payslip_id !== null)) throw new PayrollError("BLOCKED", "Partial-day or already paid legacy maternity allocations require independent review.");
  const published = await tx.payrollEarning.findFirst({ where: { business_id: businessId, employee_id: entitlement.employee_id, source_type: "LEAVE_AWARD", source_id: { startsWith: entitlement.id + ":" }, statement: { published_at: { not: null } } }, select: { id: true } });
  if (published) throw new PayrollError("BLOCKED", "Published maternity evidence cannot be replaced.");
  const overlapping = await tx.leaveEntitlement.findFirst({ where: { business_id: businessId, employee_id: entitlement.employee_id, benefit_code: "MATERNITY", id: { not: entitlement.id }, period_start: { lte: entitlement.period_end }, period_end: { gte: entitlement.period_start }, award: { not: Prisma.DbNull } }, select: { id: true } });
  if (overlapping) throw new PayrollError("BLOCKED", "Overlapping maternity awards require an independently reviewed adjustment.");
  const agreements = entitlement.employee.compensation_agreements.filter(entry => entry.effective_from <= entitlement.period_end && (!entry.effective_to || entry.effective_to >= entitlement.period_start));
  if (!agreements.length) throw new PayrollError("BLOCKED", "Verify the compensation basis underlying the full-salary amount.");
  const snapshot = { ...award, rulePackageId: settings.rule_package.id, ruleHash: settings.rule_package.content_hash, entitlementId: entitlement.id, entitlementRevision: entitlement.revision, periodStart: entitlement.period_start.toISOString().slice(0, 10), periodEnd: entitlement.period_end.toISOString().slice(0, 10), employeeRevision: entitlement.employee.financial_revision, profileRevision: profile.revision, agreements: agreements.map(entry => ({ id: entry.id, basis: entry.basis, rate: entry.rate.toString(), from: entry.effective_from, to: entry.effective_to, normalHours: entry.normal_hours.toString(), divisor: entry.monthly_divisor?.toString() ?? null })), allocationSources: entitlement.allocations.map(entry => ({ id: entry.id, date: entry.work_date, units: entry.units.toString() })).sort((a, b) => a.id.localeCompare(b.id)) };
  return { snapshot, hash: fingerprint(snapshot), revision: entitlement.revision, employeeId: entitlement.employee_id };
}
export async function previewMaternityAward(identity: PayrollIdentity, input: MaternityInput) {
  const actor = await payrollOwner(identity);
  const result = await prisma.$transaction(tx => candidate(tx, actor.businessId, maternityInputSchema.parse(input)), { isolationLevel: "RepeatableRead" });
  await payrollOwner(identity);
  return { expectedHash: result.hash, expectedRevision: result.revision, days: result.snapshot.days, totalSSS: result.snapshot.totalSSS, employerDifferential: result.snapshot.employerDifferential, total: result.snapshot.total, qualifyingWindow: result.snapshot.qualifyingWindow, selectedCredits: result.snapshot.selectedCredits, rulePackageId: result.snapshot.rulePackageId };
}
export async function recordMaternityAward(identity: PayrollIdentity, input: z.infer<typeof maternityAwardCommandSchema>) {
  return payrollCommand(identity, "MATERNITY_AWARD", input, async (tx, actor) => {
    const result = await candidate(tx, actor.businessId, maternityInputSchema.parse(input));
    stale(result.revision, input.expectedRevision);
    if (result.hash !== input.expectedHash) throw new PayrollError("STALE_REVIEW", "Maternity evidence changed. Review the updated award.");
    await tx.leaveEntitlement.update({ where: { id: input.entitlementId }, data: { award: json({ ...result.snapshot, reviewedBy: actor.userId, reviewedAt: new Date().toISOString(), sourceHash: result.hash }), revision: { increment: 1 } } });
    await tx.employee.update({ where: { id: result.employeeId, business_id: actor.businessId }, data: { financial_revision: { increment: 1 } } });
    return { id: input.entitlementId, revision: result.revision + 1 };
  });
}
export async function maternityEntitlements(identity: PayrollIdentity) {
  const actor = await payrollOwner(identity);
  const settings = await prisma.payrollSettings.findUnique({ where: { business_id: actor.businessId }, select: { rule_package: { select: { rules: true } } } });
  const rule = maternityRulesSchema.safeParse(settings?.rule_package?.rules && (settings.rule_package.rules as Record<string, unknown>).maternity);
  const records = await prisma.leaveEntitlement.findMany({ where: { business_id: actor.businessId, benefit_code: "MATERNITY", employee: { archived_at: null } }, select: { id: true, period_start: true, period_end: true, granted_units: true, revision: true, award: true, employee: { select: { user: { select: { name: true } } } } }, orderBy: { period_start: "desc" }, take: 100 });
  await payrollOwner(identity);
  return records.map(entry => ({ id: entry.id, name: entry.employee.user.name, from: entry.period_start.toISOString().slice(0, 10), to: entry.period_end.toISOString().slice(0, 10), days: entry.granted_units.toString(), reviewed: Boolean(entry.award), revision: entry.revision, qualifyingMonths: rule.success ? rule.data.qualifyingMonths : null }));
}
