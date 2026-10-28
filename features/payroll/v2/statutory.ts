import { z } from "zod";
import { amount, decimal, money, sum, Decimal } from "@/features/payroll/money";
import { eligibilitySchema, decimalString } from "./schemas";
import type { PayrollAssessmentDTO, PayrollIssue } from "./contracts";
import { governmentTemplateSchema } from "./government-format";
import { maternityRulesSchema } from "@/features/payroll/v2/leave-awards-calculation";
import { serviceChargeRulesSchema } from "@/features/payroll/v2/service-charge-calculation";

const positive = decimalString.refine(value => Number(value) >= 0);
const bracket = z.object({ threshold: positive, base: positive, rate: positive });
const share = z.object({ employee: positive, employer: positive });
export const phRulesSchema = z.object({
  version: z.string().min(1),
  maternity: maternityRulesSchema.optional(),
  serviceCharge: serviceChargeRulesSchema.optional(),
  withholding: z.object({ WEEKLY: z.array(bracket).min(1), SEMIMONTHLY: z.array(bracket).min(1), ANNUAL: z.array(bracket).min(1) }),
  sss: z.array(z.object({ from: positive, to: positive.nullable(), employee: positive, employer: positive, ec: positive, mpfEmployee: positive, mpfEmployer: positive })).min(1),
  philhealth: z.object({ rate: positive, floor: positive, ceiling: positive, employeeFraction: positive }),
  pagibig: z.object({ ceiling: positive, threshold: positive, lowEmployeeRate: positive, employeeRate: positive, employerRate: positive }),
  wages: z.array(z.object({ region: z.string(), category: z.string(), from: z.string(), to: z.string().nullable(), dailyMinimum: positive })).min(1),
  holidays: z.array(z.object({ date: z.string(), region: z.string(), type: z.enum(["special", "regular", "doubleRegular"]), evidence: z.string().min(1) })).default([]),
  premiums: z.object({
    ordinary: positive, rest: positive, special: positive, specialRest: positive,
    regular: positive, regularRest: positive, doubleRegular: positive, doubleRegularRest: positive,
    ordinaryOvertime: positive, premiumOvertime: positive, night: positive,
  }),
  benefits: z.object({ thirteenthDivisor: positive, taxExemptBenefitsCap: positive, retirementDays: positive }),
  exportTemplates: z.array(governmentTemplateSchema).default([]),
  sssContributionCodes: z.array(z.string().min(1)).default(["BASIC", "COMMISSION", "PREMIUM", "OVERTIME", "NIGHT", "ALLOWANCE", "BONUS", "SERVICE_CHARGE"]),
}).superRefine((rules, context) => {
  for (const [cadence, brackets] of Object.entries(rules.withholding)) {
    if (brackets[0].threshold !== "0" || brackets.some((entry, index) => index > 0 && decimal(entry.threshold).lte(brackets[index - 1].threshold))) context.addIssue({ code: "custom", message: "Tax brackets must start at zero and increase: " + cadence });
  }
  if (rules.sss[0].from !== "0" || rules.sss.at(-1)?.to !== null) context.addIssue({ code: "custom", message: "SSS table must cover zero through the uncapped final range" });
  for (let index = 0; index < rules.sss.length - 1; index++) {
    if (!rules.sss[index].to || !decimal(rules.sss[index].to!).eq(rules.sss[index + 1].from)) context.addIssue({ code: "custom", message: "SSS ranges must be contiguous" });
  }
  for (const table of Object.values(rules.withholding)) for (const row of table) if (decimal(row.rate).gt(1)) context.addIssue({ code: "custom", message: "Tax rates must be fractions" });
  if (decimal(rules.philhealth.floor).gt(rules.philhealth.ceiling) || decimal(rules.philhealth.rate).gt(1) || decimal(rules.philhealth.employeeFraction).gt(1)) context.addIssue({ code: "custom", message: "Invalid PhilHealth limits" });
  if (decimal(rules.benefits.thirteenthDivisor).lte(0) || decimal(rules.benefits.retirementDays).lte(0)) context.addIssue({ code: "custom", message: "Benefit divisors must be positive" });
  for (const rate of [rules.pagibig.lowEmployeeRate, rules.pagibig.employeeRate, rules.pagibig.employerRate]) if (decimal(rate).gt(1)) context.addIssue({ code: "custom", message: "Pag-IBIG rates must be fractions" });
});
export type PhRules = z.infer<typeof phRulesSchema>;
export type Eligibility = z.infer<typeof eligibilitySchema>;
export const monthlyContextSchema = z.object({
  gross: positive, taxable: positive, sss: share, philhealth: share, pagibig: share, tax: positive,
});
export type MonthlyContext = z.infer<typeof monthlyContextSchema>;
export const emptyContext = (): MonthlyContext => ({ gross: "0", taxable: "0", sss: { employee: "0", employer: "0" }, philhealth: { employee: "0", employer: "0" }, pagibig: { employee: "0", employer: "0" }, tax: "0" });
export function bracketTax(taxable: string, brackets: PhRules["withholding"]["ANNUAL"]) {
  const income = decimal(taxable); if (income.lte(0)) return "0.00";
  const row = [...brackets].reverse().find(entry => income.gt(entry.threshold)) ?? brackets[0];
  return amount(income.minus(row.threshold).times(row.rate).plus(row.base));
}
export function calculateStatutory(input: {
  rules: PhRules; eligibility: Eligibility; month: string; monthlyBasic: string;
  gross: string; taxable: string; sssBasis?: string; cadence: "WEEKLY" | "SEMIMONTHLY"; previous: MonthlyContext;
  previousTaxableInPeriod: string; previousTaxInPeriod: string;
  annual?: { taxable: string; withheld: string; subtractCurrentContributions?: boolean };
}) {
  const { rules, eligibility, previous, month } = input;
  const assessments: PayrollAssessmentDTO[] = [];
  const issues: PayrollIssue[] = [];
  const contributionGross = decimal(previous.gross).plus(input.sssBasis ?? input.gross);
  let currentEmployeeContributions = decimal(0);
  function assess(agency: "sss" | "philhealth" | "pagibig", basis: string, employee: string, employer: string) {
    const employeeDelta = money(decimal(employee).minus(previous[agency].employee));
    const employerDelta = money(decimal(employer).minus(previous[agency].employer));
    currentEmployeeContributions = currentEmployeeContributions.plus(employeeDelta);
    assessments.push({ agency: agency.toUpperCase(), month, basis: amount(basis), employeeShare: amount(employeeDelta), employerShare: amount(employerDelta), explanation: { cumulativeEmployee: amount(employee), cumulativeEmployer: amount(employer), ruleVersion: rules.version } });
  }
  if (eligibility.sss) {
    const row = rules.sss.find(entry => contributionGross.gte(entry.from) && (entry.to === null || contributionGross.lt(entry.to)));
    if (!row) issues.push({ code: "SSS_RANGE", message: "No verified SSS range covers this compensation." });
    else {
      assess("sss", amount(contributionGross), amount(sum([row.employee, row.mpfEmployee])), amount(sum([row.employer, row.ec, row.mpfEmployer])));
      Object.assign(assessments.at(-1)!.explanation, { ec: row.ec, mpfEmployee: row.mpfEmployee, mpfEmployer: row.mpfEmployer });
    }
  }
  if (eligibility.philhealth) {
    const basis = decimal(input.monthlyBasic).clamp(rules.philhealth.floor, rules.philhealth.ceiling);
    const premium = money(basis.times(rules.philhealth.rate));
    const employee = money(premium.times(rules.philhealth.employeeFraction));
    assess("philhealth", amount(basis), amount(employee), amount(premium.minus(employee)));
  }
  if (eligibility.pagibig) {
    const basis = decimal(input.monthlyBasic).clamp(0, rules.pagibig.ceiling);
    const rate = basis.lte(rules.pagibig.threshold) ? rules.pagibig.lowEmployeeRate : rules.pagibig.employeeRate;
    assess("pagibig", amount(basis), amount(basis.times(rate)), amount(basis.times(rules.pagibig.employerRate)));
  }
  if (eligibility.withholding) {
    const currentTaxable = money(decimal(input.taxable).minus(currentEmployeeContributions));
    const aggregate = currentTaxable.plus(input.previousTaxableInPeriod);
    const tax = input.annual
      ? decimal(bracketTax(amount(decimal(input.annual.taxable).minus(input.annual.subtractCurrentContributions ? currentEmployeeContributions : 0)), rules.withholding.ANNUAL)).minus(input.annual.withheld)
      : decimal(bracketTax(amount(aggregate), rules.withholding[input.cadence])).minus(input.previousTaxInPeriod);
    assessments.push({ agency: "BIR", month, basis: amount(currentTaxable), employeeShare: amount(tax), employerShare: "0.00", explanation: { ruleVersion: rules.version, annualized: Boolean(input.annual), periodTaxable: amount(aggregate) } });
  }
  return { assessments, issues };
}

export function minimumWage(rules: PhRules, region: string, category: string, workDate: string) {
  return rules.wages.find(row => row.region === region && row.category === category && row.from <= workDate && (!row.to || row.to >= workDate))?.dailyMinimum ?? null;
}
export function workPremium(input: {
  rules: PhRules; dailyRate: string; normalHours: string; ordinaryMinutes: string | number; overtimeMinutes: string | number;
  nightOrdinaryMinutes: string | number; nightOvertimeMinutes: string | number;
  dayType: "ordinary" | "rest" | "special" | "specialRest" | "regular" | "regularRest" | "doubleRegular" | "doubleRegularRest";
  overtimeEligible: boolean; nightEligible: boolean;
}) {
  const { rules, dailyRate, normalHours, dayType } = input;
  const hourly = decimal(dailyRate).div(normalHours);
  const multiplier = decimal(rules.premiums[dayType]);
  const overtimeMultiplier = dayType === "ordinary" ? rules.premiums.ordinaryOvertime : rules.premiums.premiumOvertime;
  const premium = hourly.times(decimal(input.ordinaryMinutes).plus(input.overtimeEligible ? 0 : input.overtimeMinutes)).div(60).times(multiplier.minus(1));
  const overtime = input.overtimeEligible ? hourly.times(input.overtimeMinutes).div(60).times(multiplier).times(overtimeMultiplier) : decimal(0);
  const night = input.nightEligible ? hourly.times(rules.premiums.night).times(multiplier).times(decimal(input.nightOrdinaryMinutes).plus(decimal(input.nightOvertimeMinutes).times(input.overtimeEligible ? overtimeMultiplier : 1))).div(60) : decimal(0);
  return { premium: amount(premium), overtime: amount(overtime), night: amount(night) };
}

export function calculateBenefits(input: {
  rules: PhRules; basicEarned: string; thirteenthPaid: string; dailyRate: string; remainingLeave: string;
  monthlySalary: string; serviceYears: number; separationReason?: "REDUNDANCY" | "RETRENCHMENT" | "DISEASE" | "CLOSURE";
  retirementEligible: boolean; thirteenthEligible: boolean;
}) {
  const thirteenth = input.thirteenthEligible ? money(decimal(input.basicEarned).div(input.rules.benefits.thirteenthDivisor).minus(input.thirteenthPaid)) : decimal(0);
  const years = Math.max(0, Math.floor(input.serviceYears + 0.5));
  const separation = input.separationReason
    ? Decimal.max(decimal(input.monthlySalary).times(input.separationReason === "REDUNDANCY" ? years : years * 0.5), input.monthlySalary)
    : decimal(0);
  return {
    thirteenth: amount(thirteenth), leaveConversion: amount(decimal(input.dailyRate).times(input.remainingLeave)),
    separation: amount(separation), retirement: amount(input.retirementEligible ? decimal(input.dailyRate).times(input.rules.benefits.retirementDays).times(years) : 0),
  };
}
