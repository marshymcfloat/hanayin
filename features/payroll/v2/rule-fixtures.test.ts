import { describe, expect, it } from "vitest";
import { statutoryFixtureResult, statutoryFixtureSchema, verifyStatutoryFixtures, type StatutoryFixture } from "./rule-fixtures";
import { testRules, testEligibility } from "./fixtures.test-support";
import { emptyContext } from "./statutory";
import type { MaternityRules } from "./leave-awards-calculation";

const maternityRules: MaternityRules = { version: "SYNTHETIC-FIXTURE", qualifyingMonths: 12, minimumContributions: 3, highestCredits: 6, divisor: "180", salaryCreditCeiling: "20000", liveBirthDays: 105, lossDays: 60, soloParentExtraDays: 15, sssTaxable: false, differentialTaxable: false, source: "https://www.sss.gov.ph/maternity-benefit/" };
const serviceChargeRules = { version: "SYNTHETIC-FIXTURE", taxable: true, maxPeriodDays: 16, source: "https://dole.gov.ph/news/new-rules-on-service-charge-law-out/" };
const assessmentInput = { eligibility: testEligibility, month: "2026-09", monthlyBasic: "20000", gross: "8000", taxable: "8000", cadence: "SEMIMONTHLY", previous: emptyContext(), previousTaxableInPeriod: "0", previousTaxInPeriod: "0" };
const assessmentExpected = { "SSS.employee": "250.00", "SSS.employer": "510.00", "SSS.basis": "8000.00", "PHILHEALTH.employee": "500.00", "PHILHEALTH.employer": "500.00", "PHILHEALTH.basis": "20000.00", "PAGIBIG.employee": "200.00", "PAGIBIG.employer": "200.00", "PAGIBIG.basis": "10000.00", "BIR.employee": "0.00", "BIR.employer": "0.00", "BIR.basis": "7050.00", issues: "0" };
const benefitInput = { basicEarned: "240000", thirteenthPaid: "5000", dailyRate: "800", remainingLeave: "0", monthlySalary: "20000", serviceYears: 5.6, retirementEligible: false, thirteenthEligible: true };
const core: StatutoryFixture[] = [
  { kind: "ASSESSMENT", coverage: "BRACKETS", name: "Synthetic bracket fixture", input: assessmentInput, expected: assessmentExpected },
  { kind: "ASSESSMENT", coverage: "MONTHLY_CAPS", name: "Synthetic month cap fixture", input: { ...assessmentInput, previous: { ...emptyContext(), gross: "8000", sss: { employee: "250", employer: "510" }, philhealth: { employee: "500", employer: "500" }, pagibig: { employee: "200", employer: "200" } } }, expected: { ...assessmentExpected, "SSS.employer": "500.00", "SSS.basis": "16000.00", "PHILHEALTH.employee": "0.00", "PHILHEALTH.employer": "0.00", "PAGIBIG.employee": "0.00", "PAGIBIG.employer": "0.00", "BIR.basis": "7750.00" } },
  { kind: "ASSESSMENT", coverage: "YEAR_BOUNDARY", name: "Synthetic year reconciliation", input: { ...assessmentInput, month: "2026-12", annual: { taxable: "300000", withheld: "10000" } }, expected: { ...assessmentExpected, "BIR.employee": "-2500.00" } },
  { kind: "ASSESSMENT", coverage: "PREVIOUS_EMPLOYER", name: "Synthetic prior employer context", input: { ...assessmentInput, annual: { taxable: "350000", withheld: "15000" } }, expected: assessmentExpected },
  { kind: "PREMIUM", coverage: "PREMIUMS", name: "Synthetic overtime fixture", input: { dailyRate: "800", normalHours: "8", ordinaryMinutes: 480, overtimeMinutes: 60, nightOrdinaryMinutes: 0, nightOvertimeMinutes: 0, dayType: "ordinary", overtimeEligible: true, nightEligible: true }, expected: { premium: "0.00", overtime: "125.00", night: "0.00" } },
  { kind: "BENEFIT", coverage: "THIRTEENTH", name: "Synthetic thirteenth fixture", input: benefitInput, expected: { thirteenth: "15000.00", leaveConversion: "0.00", separation: "0.00", retirement: "0.00" } },
  { kind: "BENEFIT", coverage: "FINAL_PAY", name: "Synthetic final benefit fixture", input: { ...benefitInput, remainingLeave: "3", retirementEligible: true, separationReason: "REDUNDANCY" }, expected: { thirteenth: "15000.00", leaveConversion: "2400.00", separation: "120000.00", retirement: "108000.00" } },
  { kind: "EXPORT", coverage: "EXPORTS", name: "Synthetic verified export fixture", input: { template: { agency: "SSS", version: "TEST-ONLY", source: "https://sss.gov.ph", effectiveFrom: "2026-01-01", supportedThrough: "2026-12-31", format: "CSV", header: false, columns: [{ label: "Name", field: "employeeName" }] }, rows: [{ employeeName: "Worker" }] }, expected: { content: "Worker\r\n" } },
].map(entry => statutoryFixtureSchema.parse(entry));
const maternity: StatutoryFixture = {
  kind: "MATERNITY", coverage: "MATERNITY", name: "Independent maternity arithmetic example", input: {
    entitlementId: "10000000-0000-4000-8000-000000000001", contingencyDate: "2026-10-11", event: "LIVE_BIRTH", soloParent: false, transferredDays: 0,
    contributionEvidence: "Checked contribution records", eligibilityEvidence: "Checked employee eligibility", soloParentEvidence: "", differentialExempt: false, exemptionEvidence: "", fullSalaryAmount: "90000", fullSalaryEvidence: "Checked full-salary calculation",
    credits: ["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"].map(month => ({ month, salaryCredit: "20000", contributed: true, paidOn: "2026-06-30" })),
  }, expected: { days: "105", averageDailySalaryCredit: "666.666667", totalSSS: "70000.00", employerDifferential: "20000.00", total: "90000.00", semesterStart: "2026-07-01", selectedCredits: JSON.stringify(["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12"].map(month => ({ month, salaryCredit: "20000.00", paidOn: "2026-06-30" }))), firstSSS: "666.67", lastSSS: "666.67", firstDifferential: "190.48", lastDifferential: "190.48" },
};
const service: StatutoryFixture = { kind: "SERVICE_CHARGE", coverage: "SERVICE_CHARGE", name: "Independent residual-cent distribution", input: { amount: "100.00", workers: [3, 1, 2].map(employeeId => ({ employeeId, workedMilliseconds: "3600000" })) }, expected: { "employee.1.amount": "33.34", "employee.2.amount": "33.33", "employee.3.amount": "33.33", total: "100.00" } };

describe("optional statutory certification fixture gates", () => {
  it("keeps all original eight core coverage groups mandatory", () => {
    expect(() => verifyStatutoryFixtures(testRules, core)).not.toThrow();
    expect(() => verifyStatutoryFixtures(testRules, core.slice(1))).toThrow("BRACKETS");
  });
  it("requires maternity expected results only for packages supporting maternity", () => {
    expect(() => verifyStatutoryFixtures({ ...testRules, maternity: maternityRules }, core)).toThrow("MATERNITY");
    expect(() => verifyStatutoryFixtures({ ...testRules, maternity: maternityRules }, [...core, maternity])).not.toThrow();
  });
  it("requires service-charge allocation fixtures only when supported", () => {
    expect(() => verifyStatutoryFixtures({ ...testRules, serviceCharge: serviceChargeRules }, core)).toThrow("SERVICE_CHARGE");
    expect(() => verifyStatutoryFixtures({ ...testRules, serviceCharge: serviceChargeRules }, [...core, service])).not.toThrow();
  });
  it("rejects mismatched independent amounts, missing recipients and misleading fixture labels", () => {
    expect(() => verifyStatutoryFixtures({ ...testRules, serviceCharge: serviceChargeRules }, [...core, { ...service, expected: { ...service.expected, "employee.1.amount": "33.33" } }])).toThrow("do not match");
    expect(() => verifyStatutoryFixtures({ ...testRules, serviceCharge: serviceChargeRules }, [...core, { ...service, expected: { total: "100.00" } }])).toThrow("do not match");
    expect(statutoryFixtureSchema.safeParse({ ...service, coverage: "MATERNITY" }).success).toBe(false);
    const fake = { ...core[0], coverage: "SERVICE_CHARGE" } as StatutoryFixture;
    expect(() => verifyStatutoryFixtures({ ...testRules, serviceCharge: serviceChargeRules }, [...core, fake])).toThrow("SERVICE_CHARGE");
  });
  it("does not allow eight wage cases to substitute for core calculation coverage", () => {
    const wage = { kind: "WAGE", coverage: "BRACKETS", name: "Mislabeled wage fixture", input: { region: "TEST", category: "TEST", date: "2026-10-11" }, expected: { minimum: "500" } } as StatutoryFixture;
    expect(() => verifyStatutoryFixtures(testRules, [...core.slice(1), wage])).toThrow("BRACKETS");
  });
  it("does not accept optional fixtures without the corresponding rule section", () => {
    expect(() => statutoryFixtureResult(testRules, maternity)).toThrow("maternity rule section");
    expect(() => statutoryFixtureResult(testRules, service)).toThrow("service-charge rule section");
  });
});
