import { z } from "zod";
import { calculateBenefits, calculateStatutory, minimumWage, monthlyContextSchema, workPremium, type PhRules } from "./statutory";
import { dateOnly, decimalString, eligibilitySchema } from "./schemas";
import { formatGovernmentExport, governmentTemplateSchema } from "./government-format";
import { PayrollError } from "./contracts";
import { calculateMaternityAward, maternityAllocationAmounts, maternityInputSchema } from "./leave-awards-calculation";
import { distributeServiceCharge } from "./service-charge-calculation";
import { amount, sum } from "@/features/payroll/money";

const nonnegative = decimalString.refine(value => Number(value) >= 0);
export const fixtureCoverage = ["BRACKETS", "MONTHLY_CAPS", "YEAR_BOUNDARY", "PREVIOUS_EMPLOYER", "PREMIUMS", "THIRTEENTH", "FINAL_PAY", "EXPORTS"] as const;
const common = { name: z.string().min(3).max(100), coverage: z.enum([...fixtureCoverage, "MATERNITY", "SERVICE_CHARGE"]), expected: z.record(z.string(), z.string()) };
export const statutoryFixtureSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("ASSESSMENT"), input: z.object({ eligibility: eligibilitySchema, month: z.string().regex(/^\d{4}-\d{2}$/), monthlyBasic: nonnegative, gross: nonnegative, taxable: nonnegative, sssBasis: nonnegative.optional(), cadence: z.enum(["WEEKLY", "SEMIMONTHLY"]), previous: monthlyContextSchema, previousTaxableInPeriod: decimalString, previousTaxInPeriod: decimalString, annual: z.object({ taxable: nonnegative, withheld: nonnegative, subtractCurrentContributions: z.boolean().optional() }).optional() }) }),
  z.object({ ...common, kind: z.literal("PREMIUM"), input: z.object({ dailyRate: nonnegative, normalHours: decimalString.refine(value => Number(value) > 0), ordinaryMinutes: z.number().int().nonnegative(), overtimeMinutes: z.number().int().nonnegative(), nightOrdinaryMinutes: z.number().int().nonnegative(), nightOvertimeMinutes: z.number().int().nonnegative(), dayType: z.enum(["ordinary", "rest", "special", "specialRest", "regular", "regularRest", "doubleRegular", "doubleRegularRest"]), overtimeEligible: z.boolean(), nightEligible: z.boolean() }) }),
  z.object({ ...common, kind: z.literal("BENEFIT"), input: z.object({ basicEarned: nonnegative, thirteenthPaid: nonnegative, dailyRate: nonnegative, remainingLeave: nonnegative, monthlySalary: nonnegative, serviceYears: z.number().nonnegative(), separationReason: z.enum(["REDUNDANCY", "RETRENCHMENT", "DISEASE", "CLOSURE"]).optional(), retirementEligible: z.boolean(), thirteenthEligible: z.boolean() }) }),
  z.object({ ...common, kind: z.literal("WAGE"), input: z.object({ region: z.string(), category: z.string(), date: dateOnly }) }),
  z.object({ ...common, kind: z.literal("EXPORT"), input: z.object({ template: governmentTemplateSchema, rows: z.array(z.record(z.string(), z.string())) }) }),
  z.object({ ...common, kind: z.literal("MATERNITY"), coverage: z.literal("MATERNITY"), input: maternityInputSchema }),
  z.object({ ...common, kind: z.literal("SERVICE_CHARGE"), coverage: z.literal("SERVICE_CHARGE"), input: z.object({ amount: nonnegative, workers: z.array(z.object({ employeeId: z.number().int().positive(), workedMilliseconds: z.string().regex(/^\d+$/) })).min(1).max(500) }) }),
]);
export type StatutoryFixture = z.infer<typeof statutoryFixtureSchema>;
const coverageKind = { BRACKETS: "ASSESSMENT", MONTHLY_CAPS: "ASSESSMENT", YEAR_BOUNDARY: "ASSESSMENT", PREVIOUS_EMPLOYER: "ASSESSMENT", PREMIUMS: "PREMIUM", THIRTEENTH: "BENEFIT", FINAL_PAY: "BENEFIT", EXPORTS: "EXPORT" } as const;
export function statutoryFixtureResult(rules: PhRules, fixture: StatutoryFixture): Record<string, string> {
  switch (fixture.kind) {
    case "ASSESSMENT": {
      const result = calculateStatutory({ rules, ...fixture.input });
      return Object.fromEntries([...result.assessments.flatMap(entry => [[entry.agency + ".employee", entry.employeeShare], [entry.agency + ".employer", entry.employerShare], [entry.agency + ".basis", entry.basis]]), ["issues", String(result.issues.length)]]);
    }
    case "PREMIUM": return workPremium({ rules, ...fixture.input });
    case "BENEFIT": return calculateBenefits({ rules, ...fixture.input });
    case "WAGE": return { minimum: minimumWage(rules, fixture.input.region, fixture.input.category, fixture.input.date) ?? "UNSUPPORTED" };
    case "EXPORT": return { content: formatGovernmentExport(fixture.input.template, fixture.input.rows) };
    case "MATERNITY": {
      if (!rules.maternity) throw new PayrollError("BLOCKED", "Maternity fixtures require a maternity rule section.");
      const award = calculateMaternityAward(fixture.input, rules.maternity);
      const first = maternityAllocationAmounts(award, 1); const last = maternityAllocationAmounts(award, award.days);
      return { days: String(award.days), averageDailySalaryCredit: award.averageDailySalaryCredit, totalSSS: award.totalSSS, employerDifferential: award.employerDifferential, total: award.total, semesterStart: award.qualifyingWindow.semesterStart, selectedCredits: JSON.stringify(award.selectedCredits), firstSSS: first.sss, lastSSS: last.sss, firstDifferential: first.differential, lastDifferential: last.differential };
    }
    case "SERVICE_CHARGE": {
      if (!rules.serviceCharge) throw new PayrollError("BLOCKED", "Service-charge fixtures require a service-charge rule section.");
      const allocations = distributeServiceCharge(fixture.input.amount, fixture.input.workers);
      return Object.fromEntries([...allocations.map(entry => ["employee." + entry.employeeId + ".amount", entry.amount]), ["total", amount(sum(allocations.map(entry => entry.amount)))]]);
    }
  }
}
export function verifyStatutoryFixtures(rules: PhRules, fixtures: StatutoryFixture[]) {
  for (const fixture of fixtures) {
    const actual = statutoryFixtureResult(rules, fixture);
    if (Object.keys(actual).length !== Object.keys(fixture.expected).length || Object.entries(actual).some(([key, value]) => value !== fixture.expected[key])) throw new PayrollError("BLOCKED", "Independent expected results do not match: " + fixture.name);
  }
  for (const coverage of fixtureCoverage) if (!fixtures.some(fixture => fixture.coverage === coverage && fixture.kind === coverageKind[coverage])) throw new PayrollError("BLOCKED", "Independent fixture coverage is missing: " + coverage);
  if (rules.maternity && !fixtures.some(fixture => fixture.kind === "MATERNITY" && fixture.coverage === "MATERNITY")) throw new PayrollError("BLOCKED", "Independent fixture coverage is missing: MATERNITY");
  if (rules.serviceCharge && !fixtures.some(fixture => fixture.kind === "SERVICE_CHARGE" && fixture.coverage === "SERVICE_CHARGE")) throw new PayrollError("BLOCKED", "Independent fixture coverage is missing: SERVICE_CHARGE");
}
