import { describe, expect, it } from "vitest";
import { calculateStatutory, emptyContext, bracketTax, calculateBenefits, workPremium, phRulesSchema } from "./statutory";
import { testRules, testEligibility } from "./fixtures.test-support";

describe("versioned payroll calculations", () => {
  const input = { rules: testRules, eligibility: testEligibility, month: "2026-09", monthlyBasic: "20000", gross: "8000", taxable: "8000", cadence: "SEMIMONTHLY" as const, previous: emptyContext(), previousTaxableInPeriod: "0", previousTaxInPeriod: "0" };
  it("uses independent PhilHealth basic salary rather than commission-enhanced gross", () => {
    const result = calculateStatutory({ ...input, gross: "90000", taxable: "90000" });
    expect(result.assessments.find(entry => entry.agency === "PHILHEALTH")).toMatchObject({ basis: "20000.00", employeeShare: "500.00", employerShare: "500.00" });
    expect(result.assessments.find(entry => entry.agency === "PAGIBIG")?.employeeShare).toBe("200.00");
  });
  it("charges only the incremental monthly assessment in subsequent runs", () => {
    const previous = { ...emptyContext(), gross: "8000", sss: { employee: "250", employer: "510" }, philhealth: { employee: "500", employer: "500" }, pagibig: { employee: "200", employer: "200" } };
    const result = calculateStatutory({ ...input, previous });
    expect(result.assessments.find(entry => entry.agency === "SSS")).toMatchObject({ employeeShare: "250.00", employerShare: "500.00" });
    expect(result.assessments.find(entry => entry.agency === "PHILHEALTH")?.employeeShare).toBe("0.00");
    expect(result.assessments.find(entry => entry.agency === "PAGIBIG")?.employeeShare).toBe("0.00");
  });
  it("does not reuse the tax-free threshold for a supplementary run in the same period", () => {
    const result = calculateStatutory({ ...input, gross: "5000", taxable: "5000", eligibility: { ...testEligibility, sss: false, philhealth: false, pagibig: false }, previousTaxableInPeriod: "15000", previousTaxInPeriod: "687.45" });
    expect(result.assessments.find(entry => entry.agency === "BIR")?.employeeShare).toBe("750.00");
  });
  it("preserves annual tax refunds instead of silently discarding negatives", () => {
    expect(bracketTax("300000", testRules.withholding.ANNUAL)).toBe("7500.00");
    const result = calculateStatutory({ ...input, annual: { taxable: "300000", withheld: "10000" } });
    expect(result.assessments.find(entry => entry.agency === "BIR")?.employeeShare).toBe("-2500.00");
  });
  it("keeps exempt benefits outside the SSS contribution basis", () => {
    const result = calculateStatutory({ ...input, gross: "18000", taxable: "8000", sssBasis: "8000" });
    expect(result.assessments.find(entry => entry.agency === "SSS")).toMatchObject({ basis: "8000.00", employeeShare: "250.00" });
  });
  it("combines holiday, overtime and night factors with distinct ordinary and overtime minutes", () => {
    const result = workPremium({ rules: testRules, dailyRate: "800", normalHours: "8", ordinaryMinutes: 480, overtimeMinutes: 60, nightOrdinaryMinutes: 60, nightOvertimeMinutes: 60, dayType: "regularRest", overtimeEligible: true, nightEligible: true });
    expect(result).toEqual({ premium: "1280.00", overtime: "338.00", night: "59.80" });
  });
  it("calculates final benefits from earned basic pay and verified eligibility", () => {
    expect(calculateBenefits({ rules: testRules, basicEarned: "240000", thirteenthPaid: "5000", dailyRate: "800", remainingLeave: "3", monthlySalary: "20000", serviceYears: 5.6, separationReason: "REDUNDANCY", retirementEligible: true, thirteenthEligible: true })).toEqual({ thirteenth: "15000.00", leaveConversion: "2400.00", separation: "120000.00", retirement: "108000.00" });
  });
  it("rejects gaps in contribution tables", () => {
    const rules = structuredClone(testRules); rules.sss[1].from = "11000";
    expect(phRulesSchema.safeParse(rules).success).toBe(false);
  });
});
