import { z } from "zod";
import { amount, decimal, Decimal, sum } from "@/features/payroll/money";
import { dateOnly, decimalString } from "@/features/payroll/v2/schemas";
import { PayrollError } from "@/features/payroll/v2/contracts";

const positive = decimalString.refine(value => decimal(value).gt(0));
export const maternityRulesSchema = z.object({
  version: z.string().min(1), qualifyingMonths: z.number().int().min(1).max(24),
  minimumContributions: z.number().int().positive(), highestCredits: z.number().int().positive(),
  divisor: positive, salaryCreditCeiling: positive,
  liveBirthDays: z.number().int().positive().max(366), lossDays: z.number().int().positive().max(366),
  soloParentExtraDays: z.number().int().nonnegative().max(60),
  sssTaxable: z.boolean(), differentialTaxable: z.boolean(), source: z.string().url().refine(value => new URL(value).hostname === "sss.gov.ph" || new URL(value).hostname.endsWith(".sss.gov.ph"), "Use an official SSS source"),
}).refine(value => value.minimumContributions <= value.qualifyingMonths && value.highestCredits <= value.qualifyingMonths, "Invalid qualifying credit counts");
export type MaternityRules = z.infer<typeof maternityRulesSchema>;
export const maternityInputSchema = z.object({
  entitlementId: z.string().uuid(), contingencyDate: dateOnly,
  event: z.enum(["LIVE_BIRTH", "PREGNANCY_LOSS"]), soloParent: z.boolean(),
  transferredDays: z.number().int().nonnegative().max(7).default(0),
  contributionEvidence: z.string().trim().min(10).max(1000),
  eligibilityEvidence: z.string().trim().min(10).max(1000),
  soloParentEvidence: z.string().trim().max(1000).default(""),
  fullSalaryAmount: decimalString.refine(value => decimal(value).gte(0)),
  fullSalaryEvidence: z.string().trim().min(10).max(1000),
  differentialExempt: z.boolean(), exemptionEvidence: z.string().trim().max(1000).default(""),
  credits: z.array(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), salaryCredit: decimalString.refine(value => decimal(value).gte(0)), contributed: z.boolean(), paidOn: dateOnly.optional() })).min(1).max(24),
}).refine(value => !value.soloParent || (value.event === "LIVE_BIRTH" && value.soloParentEvidence.length >= 10), "Verify the solo-parent qualification for live childbirth")
  .refine(value => !value.differentialExempt || value.exemptionEvidence.length >= 10, "Verify the employer differential exemption");
export type MaternityInput = z.infer<typeof maternityInputSchema>;

export function maternityQualifyingWindow(date: string, months: number) {
  const current = new Date(dateOnly.parse(date) + "T00:00:00Z");
  const semester = new Date(Date.UTC(current.getUTCFullYear(), Math.floor(current.getUTCMonth() / 3) * 3 - 3, 1));
  const start = new Date(semester); start.setUTCMonth(start.getUTCMonth() - months);
  const qualifying: string[] = [];
  for (const cursor = new Date(start); cursor < semester; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) qualifying.push(cursor.toISOString().slice(0, 7));
  return { semesterStart: semester.toISOString().slice(0, 10), months: qualifying };
}
export function calculateMaternityAward(input: MaternityInput, rules: MaternityRules) {
  const verified = maternityInputSchema.parse(input); const rule = maternityRulesSchema.parse(rules);
  if (verified.transferredDays) throw new PayrollError("BLOCKED", "Transferred maternity days require an independently reviewed allocation case.");
  const window = maternityQualifyingWindow(verified.contingencyDate, rule.qualifyingMonths);
  const supplied = new Map(verified.credits.map(entry => [entry.month, entry]));
  if (supplied.size !== verified.credits.length || supplied.size !== window.months.length || window.months.some(month => !supplied.has(month))) throw new PayrollError("BLOCKED", "Verify every qualifying month, including months with no contribution.");
  const eligible = verified.credits.filter(entry => entry.contributed && entry.paidOn && entry.paidOn < window.semesterStart);
  if (verified.credits.some(entry => entry.contributed && (!entry.paidOn || !decimal(entry.salaryCredit).gt(0)))) throw new PayrollError("BLOCKED", "Contributed months require a positive salary credit and verified payment date.");
  if (verified.credits.some(entry => !entry.contributed && decimal(entry.salaryCredit).gt(0))) throw new PayrollError("BLOCKED", "A salary credit without a contribution must be reviewed.");
  if (eligible.length < rule.minimumContributions) throw new PayrollError("BLOCKED", "Qualifying contributions do not meet the certified eligibility requirement.");
  const selected = eligible.map(entry => ({ month: entry.month, salaryCredit: amount(Decimal.min(entry.salaryCredit, rule.salaryCreditCeiling)), paidOn: entry.paidOn! })).sort((a, b) => decimal(b.salaryCredit).comparedTo(a.salaryCredit) || a.month.localeCompare(b.month)).slice(0, rule.highestCredits);
  const creditTotal = sum(selected.map(entry => entry.salaryCredit));
  const days = verified.event === "LIVE_BIRTH" ? rule.liveBirthDays + (verified.soloParent ? rule.soloParentExtraDays : 0) : rule.lossDays;
  const sss = amount(creditTotal.div(rule.divisor).times(days));
  const differential = amount(verified.differentialExempt ? 0 : Decimal.max(0, decimal(verified.fullSalaryAmount).minus(sss)));
  return { version: 1 as const, ruleVersion: rule.version, qualifyingWindow: window, selectedCredits: selected, days, averageDailySalaryCredit: creditTotal.div(rule.divisor).toFixed(6), totalSSS: sss, employerDifferential: differential, total: amount(decimal(sss).plus(differential)), sssTaxable: rule.sssTaxable, differentialTaxable: rule.differentialTaxable, input: verified };
}
export type MaternityAward = ReturnType<typeof calculateMaternityAward>;
export const maternityAwardSchema = z.object({
  version: z.literal(1), days: z.number().int().positive().max(366),
  totalSSS: decimalString.refine(value => decimal(value).gte(0)), employerDifferential: decimalString.refine(value => decimal(value).gte(0)),
  sssTaxable: z.boolean(), differentialTaxable: z.boolean(),
  entitlementId: z.string().uuid(), rulePackageId: z.string().min(1), ruleHash: z.string().regex(/^[a-f0-9]{64}$/), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  periodStart: dateOnly, periodEnd: dateOnly,
}).passthrough().refine(value => Date.parse(value.periodEnd) - Date.parse(value.periodStart) === (value.days - 1) * 86400000, "Award dates must cover its exact calendar duration");
export function maternityAllocationAmounts(award: Pick<MaternityAward, "days" | "totalSSS" | "employerDifferential">, ordinal: number) {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > award.days) throw new PayrollError("BLOCKED", "The leave allocation exceeds the reviewed maternity award.");
  const share = (total: string) => amount(decimal(amount(decimal(total).times(ordinal).div(award.days))).minus(amount(decimal(total).times(ordinal - 1).div(award.days))));
  return { sss: share(award.totalSSS), differential: share(award.employerDifferential) };
}
