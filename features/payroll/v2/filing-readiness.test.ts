import { describe, expect, it } from "vitest";
import { agencyFilingReadiness, assertAgencyFilingReady, type FilingReadinessInput } from "./filing-readiness";

const baseline = (): FilingReadinessInput => ({
  agency: "SSS", month: "2026-09", asOf: "2026-10-01",
  employees: [{ employeeId: 1, employmentStart: "2026-01-01", employmentEnd: null, eligibility: [{ from: "2026-01-01", eligible: true }] }],
  assessments: [{ employeeId: 1, month: "2026-09", agency: "SSS", published: true, certified: true, itemized: true }],
});

describe("agency filing completeness", () => {
  it("blocks filing through the last calendar day and allows the next day, including leap February", () => {
    for (const agency of ["BIR", "SSS", "PHILHEALTH", "PAGIBIG"] as const) {
      expect(agencyFilingReadiness({ ...baseline(), agency, asOf: "2026-09-30" })[0].code).toBe("INCOMPLETE_MONTH");
    }
    expect(agencyFilingReadiness(baseline())).toEqual([]);
    expect(agencyFilingReadiness({ ...baseline(), agency: "BIR", month: "2024-02", asOf: "2024-02-29" })[0].code).toBe("INCOMPLETE_MONTH");
    expect(agencyFilingReadiness({ ...baseline(), agency: "BIR", month: "2024-02", asOf: "2024-03-01" })).toEqual([]);
  });
  it("requires a no-pay eligible employee assessment rather than silently omitting them", () => {
    const input = baseline(); input.assessments = [];
    expect(agencyFilingReadiness(input)).toMatchObject([{ employeeId: 1, code: "MISSING_ASSESSMENT" }]);
    expect(() => assertAgencyFilingReady(input)).toThrow("even when no pay was recorded");
  });
  it("uses month employment overlap, including leavers, rather than current active status", () => {
    const input = baseline(); input.assessments = [];
    input.employees[0].employmentEnd = "2026-09-01";
    expect(agencyFilingReadiness(input)[0].code).toBe("MISSING_ASSESSMENT");
    input.employees[0].employmentEnd = "2026-08-31";
    expect(agencyFilingReadiness(input)).toEqual([]);
    input.employees[0].employmentStart = "2026-10-01"; input.employees[0].employmentEnd = null;
    expect(agencyFilingReadiness(input)).toEqual([]);
  });
  it("blocks absent, uncovered, or contradictory eligibility and unknown employment dates", () => {
    const input = baseline(); input.employees[0].eligibility = null;
    expect(agencyFilingReadiness(input)[0].code).toBe("ELIGIBILITY_EVIDENCE");
    input.employees[0].eligibility = [{ from: "2026-09-02", eligible: true }];
    expect(agencyFilingReadiness(input)[0].code).toBe("ELIGIBILITY_EVIDENCE");
    input.employees[0].eligibility = [{ from: "2026-01-01", eligible: true }, { from: "2026-01-01", eligible: false }];
    expect(agencyFilingReadiness(input)[0].code).toBe("ELIGIBILITY_EVIDENCE");
    input.employees[0].employmentStart = null;
    expect(agencyFilingReadiness(input)[0].code).toBe("EMPLOYMENT_EVIDENCE");
  });
  it("requires exclusion evidence and still assesses a partially eligible month", () => {
    const input = baseline(); input.assessments = [];
    input.employees[0].eligibility = [{ from: "2026-01-01", eligible: false }];
    expect(agencyFilingReadiness(input)[0].code).toBe("ELIGIBILITY_EVIDENCE");
    input.employees[0].eligibility[0].exemptionEvidence = "Verified exclusion evidence reference";
    expect(agencyFilingReadiness(input)).toEqual([]);
    input.employees[0].eligibility.push({ from: "2026-09-30", eligible: true });
    expect(agencyFilingReadiness(input)[0].code).toBe("MISSING_ASSESSMENT");
    input.employees[0].eligibility[1].from = "2026-10-01";
    expect(agencyFilingReadiness(input)).toEqual([]);
  });
  it("rejects draft, uncertified, unitemized, wrong-month, or wrong-agency evidence", () => {
    for (const field of ["published", "certified", "itemized"] as const) {
      const input = baseline(); input.assessments[0][field] = false;
      expect(agencyFilingReadiness(input)[0].code).toBe("UNVERIFIED_ASSESSMENT");
    }
    const input = baseline(); input.assessments[0].month = "2026-08";
    expect(agencyFilingReadiness(input)[0].code).toBe("MISSING_ASSESSMENT");
    input.assessments[0].month = "2026-09"; input.assessments[0].agency = "PAGIBIG";
    expect(agencyFilingReadiness(input)[0].code).toBe("MISSING_ASSESSMENT");
  });
  it("does not impose a contribution roster on BIR actual-payment filing", () => {
    expect(agencyFilingReadiness({ ...baseline(), agency: "BIR", employees: [{ employeeId: 1, employmentStart: null, employmentEnd: null, eligibility: null }], assessments: [] })).toEqual([]);
  });
  it("rejects invalid dates and duplicate roster identities", () => {
    expect(() => agencyFilingReadiness({ ...baseline(), asOf: "2026-02-30" })).toThrow("valid filing review date");
    const input = baseline(); input.employees.push({ ...input.employees[0] });
    expect(agencyFilingReadiness(input)[0].code).toBe("EMPLOYMENT_EVIDENCE");
    input.employees = [input.employees[0]]; input.employees[0].employmentEnd = "2025-12-31";
    expect(agencyFilingReadiness(input)[0].code).toBe("EMPLOYMENT_EVIDENCE");
  });
});
