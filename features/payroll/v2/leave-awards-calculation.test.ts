import { describe, expect, it } from "vitest";
import { calculateMaternityAward, maternityAllocationAmounts, maternityQualifyingWindow, maternityAwardSchema, type MaternityInput, type MaternityRules } from "./leave-awards-calculation";
import { amount, sum } from "@/features/payroll/money";

const rules: MaternityRules = { version: "SYNTHETIC_REVIEW_FIXTURE", qualifyingMonths: 12, minimumContributions: 3, highestCredits: 6, divisor: "180", salaryCreditCeiling: "20000", liveBirthDays: 105, lossDays: 60, soloParentExtraDays: 15, sssTaxable: false, differentialTaxable: false, source: "https://www.sss.gov.ph/maternity-benefit/" };
const base: MaternityInput = { entitlementId: "10000000-0000-4000-8000-000000000001", contingencyDate: "2026-10-11", event: "LIVE_BIRTH", soloParent: false, transferredDays: 0, contributionEvidence: "Independently checked contribution history", eligibilityEvidence: "Verified eligibility record", soloParentEvidence: "", fullSalaryAmount: "90000", fullSalaryEvidence: "Verified full salary calculation", differentialExempt: false, exemptionEvidence: "", credits: maternityQualifyingWindow("2026-10-11", 12).months.map(month => ({ month, salaryCredit: "20000", contributed: true, paidOn: "2026-06-30" })) };
describe("maternity award evidence and arithmetic", () => {
  it("excludes the contingency semester across the year boundary", () => {
    expect(maternityQualifyingWindow("2026-02-14", 12)).toEqual({ semesterStart: "2025-10-01", months: ["2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09"] });
  });
  it("caps benefit salary credits and preserves the employer differential", () => {
    const result = calculateMaternityAward({ ...base, credits: base.credits.map(entry => ({ ...entry, salaryCredit: "35000" })) }, rules);
    expect(result).toMatchObject({ days: 105, totalSSS: "70000.00", employerDifferential: "20000.00", total: "90000.00" });
  });
  it("uses loss duration and separately verified solo-parent duration", () => {
    expect(calculateMaternityAward({ ...base, event: "PREGNANCY_LOSS" }, rules).totalSSS).toBe("40000.00");
    expect(calculateMaternityAward({ ...base, soloParent: true, soloParentEvidence: "Verified current solo-parent evidence" }, rules).totalSSS).toBe("80000.00");
  });
  it("requires all qualifying months and sufficient timely contributions", () => {
    expect(() => calculateMaternityAward({ ...base, credits: base.credits.slice(1) }, rules)).toThrow("every qualifying month");
    expect(() => calculateMaternityAward({ ...base, credits: base.credits.map(entry => ({ ...entry, paidOn: "2026-07-01" })) }, rules)).toThrow("do not meet");
    expect(() => calculateMaternityAward({ ...base, credits: base.credits.map(entry => ({ ...entry, paidOn: undefined })) }, rules)).toThrow("verified payment date");
  });
  it("does not silently handle transferred benefit days or unverified exemptions", () => {
    expect(() => calculateMaternityAward({ ...base, transferredDays: 3 }, rules)).toThrow("independently reviewed");
    expect(() => calculateMaternityAward({ ...base, differentialExempt: true }, rules)).toThrow();
  });
  it("allocates all award cents exactly without intermediate daily-rate loss", () => {
    const award = { days: 105, totalSSS: "70000.01", employerDifferential: "20000.03" };
    const allocations = Array.from({ length: award.days }, (_, index) => maternityAllocationAmounts(award, index + 1));
    expect(amount(sum(allocations.map(entry => entry.sss)))).toBe("70000.01");
    expect(amount(sum(allocations.map(entry => entry.differential)))).toBe("20000.03");
    expect(() => maternityAllocationAmounts(award, 106)).toThrow();
  });
  it("rejects persisted awards whose date extent cannot reconcile to their days", () => {
    const award = { ...calculateMaternityAward(base, rules), entitlementId: base.entitlementId, rulePackageId: "TEST_ONLY", ruleHash: "a".repeat(64), sourceHash: "b".repeat(64), periodStart: "2026-10-11", periodEnd: "2027-01-23" };
    expect(maternityAwardSchema.safeParse(award).success).toBe(true);
    expect(maternityAwardSchema.safeParse({ ...award, periodEnd: "2027-01-24" }).success).toBe(false);
  });
});
