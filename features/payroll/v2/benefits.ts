import "server-only";
import { z } from "zod";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { amount, decimal, sum, Decimal } from "@/features/payroll/money";
import { dateOnly, commandEnvelope, eligibilitySchema } from "./schemas";
import { calculateBenefits, phRulesSchema } from "./statutory";
import { payrollOwner } from "./access";
import { fingerprint, json, payrollCommand, stale } from "./command";
import { day, phDay } from "./period";
import { PayrollError, type PayrollIdentity } from "./contracts";
import { eligibilityAt, openingForYear } from "./profile-history";
import { calendarAge, calendarEmploymentDuration } from "@/features/payroll/v2/employment-duration";

export const benefitInputSchema = z.object({
  employeeId: z.number().int().positive(), date: dateOnly, kind: z.enum(["THIRTEENTH", "FINAL"]),
  convertSil: z.boolean().default(false), separationReason: z.enum(["REDUNDANCY", "RETRENCHMENT", "DISEASE", "CLOSURE"]).optional(),
  retirementDateOfBirth: dateOnly.optional(), separationTaxExempt: z.boolean().default(false), retirementTaxExempt: z.boolean().default(false), evidence: z.string().trim().min(10).max(1000),
}).refine(value => value.kind === "FINAL" || (!value.convertSil && !value.separationReason && !value.retirementDateOfBirth), "Final benefits require a final-pay review");
export const benefitCommandSchema = commandEnvelope.extend(benefitInputSchema.shape).extend({ expectedHash: z.string().regex(/^[a-f0-9]{64}$/) });
type Input = z.infer<typeof benefitInputSchema>;
async function candidate(tx: Prisma.TransactionClient, businessId: string, input: Input) {
  if (input.date > phDay(new Date())) throw new PayrollError("BLOCKED", "Benefits can only cover completed work.");
  const employee = await tx.employee.findFirst({ where: { id: input.employeeId, business_id: businessId, archived_at: null }, include: { payroll_profile: true, compensation_agreements: true, leave_entitlements: { include: { allocations: { where: { cancelled_at: null } } } } } });
  const settings = await tx.payrollSettings.findUnique({ where: { business_id: businessId }, include: { rule_package: true } });
  if (settings?.calculation_policy === "SIMPLE") throw new PayrollError("BLOCKED", "Automatic benefits require government-calculation setup. Record externally calculated amounts as named manual additions.");
  if (!employee?.employment_start || !employee.payroll_profile?.opening_confirmed_at || !settings?.rule_package?.certified_at) throw new PayrollError("BLOCKED", "Verified employment, opening records, and certified benefit rules are required.");
  const rules = phRulesSchema.parse(settings.rule_package.rules);
  const openingResult = openingForYear(employee.payroll_profile.opening_history, employee.payroll_profile.ytd_opening, Number(input.date.slice(0, 4)));
  if (!openingResult.success) throw new PayrollError("BLOCKED", "Verify the benefit-year opening records.");
  const opening = openingResult.data;
  const eligibility = eligibilitySchema.parse(eligibilityAt(employee.payroll_profile.eligibility_history, input.date)?.eligibility);
  if (opening.year !== Number(input.date.slice(0, 4)) || settings.rule_package.effective_from > day(input.date) || settings.rule_package.supported_through < day(input.date)) throw new PayrollError("BLOCKED", "The opening year and certified rules must cover the benefit date.");
  if (input.kind === "FINAL" && employee.employment_end?.toISOString().slice(0, 10) !== input.date) throw new PayrollError("BLOCKED", "Confirm the employment end date before calculating final benefits.");
  const agreement = employee.compensation_agreements.find(entry => entry.effective_from <= day(input.date) && (!entry.effective_to || entry.effective_to >= day(input.date)));
  if (!agreement) throw new PayrollError("BLOCKED", "A compensation agreement is required at the benefit date.");
  const earnings = await tx.payrollEarning.findMany({ where: { business_id: businessId, employee_id: employee.id, reversed_at: null, earned_on: { gte: day(input.date.slice(0, 4) + "-01-01"), lte: day(input.date) } }, select: { id: true, amount: true, is_basic: true, code: true, source_type: true, source_id: true, snapshot: true } });
  const basicEarned = decimal(opening.basicEarned).plus(sum(earnings.filter(entry => entry.is_basic && (entry.snapshot as { thirteenthEligible?: boolean }).thirteenthEligible).map(entry => entry.amount)));
  const thirteenthPaid = decimal(opening.thirteenthPaid).plus(sum(earnings.filter(entry => entry.code.startsWith("THIRTEENTH_")).map(entry => entry.amount)));
  const dailyRate = agreement.basis === "DAILY" ? agreement.rate : agreement.basis === "HOURLY" ? agreement.rate.times(agreement.normal_hours) : agreement.rate.div(agreement.monthly_divisor!);
  const serviceDuration = calendarEmploymentDuration(employee.employment_start, input.date);
  const serviceYears = serviceDuration.roundedServiceYears;
  const age = input.retirementDateOfBirth ? calendarAge(input.retirementDateOfBirth, input.date) : 0;
  if (input.retirementDateOfBirth && (age < 60 || serviceDuration.completedYears < 5)) throw new PayrollError("BLOCKED", "Retirement benefits require verified qualifying age and service; other cases need independent review.");
  const leave = input.convertSil ? employee.leave_entitlements.filter(entry => entry.benefit_code === "SIL" && entry.period_start <= day(input.date)).map(entry => ({ id: entry.id, units: amount(Decimal.max(0, entry.granted_units.minus(entry.converted_units).minus(sum(entry.allocations.map(allocation => allocation.units))))) })) : [];
  const amounts = calculateBenefits({ rules, basicEarned: amount(basicEarned), thirteenthPaid: amount(thirteenthPaid), dailyRate: amount(dailyRate), remainingLeave: amount(sum(leave.map(entry => entry.units))), monthlySalary: employee.payroll_profile.monthly_basic.toString(), serviceYears, separationReason: input.separationReason, retirementEligible: Boolean(input.retirementDateOfBirth), thirteenthEligible: eligibility.thirteenthMonth || basicEarned.gt(0) });
  if (decimal(amounts.thirteenth).lt(0)) throw new PayrollError("BLOCKED", "Recorded thirteenth-month payments exceed entitlement. Review a linked recovery; nothing is silently deducted.");
  const exempt = Decimal.min(Decimal.max(0, decimal(rules.benefits.taxExemptBenefitsCap).minus(thirteenthPaid)), amounts.thirteenth);
  const items = [
    { code: "THIRTEENTH_EXEMPT", amount: amount(exempt), taxable: false },
    { code: "THIRTEENTH_TAXABLE", amount: amount(decimal(amounts.thirteenth).minus(exempt)), taxable: true },
    { code: "LEAVE_CONVERSION", amount: amounts.leaveConversion, taxable: false },
    { code: "SEPARATION", amount: amounts.separation, taxable: !input.separationTaxExempt },
    { code: "RETIREMENT", amount: amounts.retirement, taxable: !input.retirementTaxExempt },
  ].filter(entry => decimal(entry.amount).gt(0));
  const sourceId = input.kind + ":" + employee.id + ":" + (input.kind === "FINAL" ? input.date : input.date.slice(0, 4));
  if (input.kind === "FINAL" && earnings.some(entry => entry.source_type === "BENEFIT" && entry.source_id === sourceId)) throw new PayrollError("BLOCKED", "Final benefits were already recorded. Use a linked adjustment for corrections.");
  const snapshot = { input, employeeRevision: employee.financial_revision, agreementId: agreement.id, rulePackageId: settings.rule_package_id, ruleHash: settings.rule_package.content_hash, opening, basicEarned: amount(basicEarned), thirteenthPaid: amount(thirteenthPaid), dailyRate: amount(dailyRate), serviceYears, serviceDuration, items, leave, sourceIds: earnings.map(entry => entry.id).sort() };
  return { snapshot, hash: fingerprint(snapshot), revision: employee.financial_revision, sourceId };
}
export async function previewBenefits(identity: PayrollIdentity, input: Input) {
  const actor = await payrollOwner(identity);
  const result = await prisma.$transaction(tx => candidate(tx, actor.businessId, input), { isolationLevel: "RepeatableRead" });
  await payrollOwner(identity);
  return { expectedHash: result.hash, expectedRevision: result.revision, items: result.snapshot.items, basicEarned: result.snapshot.basicEarned, thirteenthPaid: result.snapshot.thirteenthPaid, leaveUnits: amount(sum(result.snapshot.leave.map(entry => entry.units))), rulePackageId: result.snapshot.rulePackageId };
}
export async function recordBenefits(identity: PayrollIdentity, input: z.infer<typeof benefitCommandSchema>) {
  return payrollCommand(identity, "BENEFITS", input, async (tx, actor) => {
    const result = await candidate(tx, actor.businessId, benefitInputSchema.parse(input));
    stale(result.revision, input.expectedRevision);
    if (result.hash !== input.expectedHash) throw new PayrollError("STALE_REVIEW", "Benefit sources changed. Review the new calculation.");
    if (!result.snapshot.items.length) throw new PayrollError("BLOCKED", "No additional benefit is due for this selection.");
    await tx.payrollEarning.createMany({ data: result.snapshot.items.map(entry => ({ business_id: actor.businessId, employee_id: input.employeeId, source_type: "BENEFIT", source_id: result.sourceId, source_revision: result.revision, earned_on: day(input.date), payable_on: day(input.date), code: entry.code, description: entry.code.replaceAll("_", " ") + " · reviewed benefit", amount: decimal(entry.amount), rate: decimal(entry.amount), units: 1, taxable: entry.taxable, tax_category: entry.code.startsWith("THIRTEENTH_") ? "BENEFITS_CAP" : entry.taxable ? "NORMAL" : "EXEMPT", is_basic: false, snapshot: json(result.snapshot) })) });
    for (const leave of result.snapshot.leave) await tx.leaveEntitlement.update({ where: { id: leave.id }, data: { converted_units: { increment: decimal(leave.units) }, revision: { increment: 1 } } });
    await tx.employee.update({ where: { id: input.employeeId }, data: { financial_revision: { increment: 1 } } });
    return { id: result.sourceId };
  });
}
