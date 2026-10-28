import type { PhRules } from "./statutory";

// Synthetic, deliberately not a production-certified Philippine rule package.
export const testRules: PhRules = {
  version: "SYNTHETIC-TEST-ONLY",
  withholding: {
    WEEKLY: [{ threshold: "0", base: "0", rate: "0" }, { threshold: "4808", base: "0", rate: "0.15" }],
    SEMIMONTHLY: [{ threshold: "0", base: "0", rate: "0" }, { threshold: "10417", base: "0", rate: "0.15" }],
    ANNUAL: [{ threshold: "0", base: "0", rate: "0" }, { threshold: "250000", base: "0", rate: "0.15" }],
  },
  sss: [
    { from: "0", to: "10000", employee: "250", employer: "500", ec: "10", mpfEmployee: "0", mpfEmployer: "0" },
    { from: "10000", to: null, employee: "500", employer: "1000", ec: "10", mpfEmployee: "0", mpfEmployer: "0" },
  ],
  philhealth: { rate: "0.05", floor: "10000", ceiling: "100000", employeeFraction: "0.5" },
  pagibig: { ceiling: "10000", threshold: "1500", lowEmployeeRate: "0.01", employeeRate: "0.02", employerRate: "0.02" },
  wages: [{ region: "TEST", category: "TEST", from: "2026-01-01", to: null, dailyMinimum: "500" }],
  holidays: [],
  premiums: { ordinary: "1", rest: "1.3", special: "1.3", specialRest: "1.5", regular: "2", regularRest: "2.6", doubleRegular: "3", doubleRegularRest: "3.9", ordinaryOvertime: "1.25", premiumOvertime: "1.3", night: "0.1" },
  benefits: { thirteenthDivisor: "12", taxExemptBenefitsCap: "90000", retirementDays: "22.5" },
  exportTemplates: [],
  sssContributionCodes: ["BASIC", "COMMISSION", "PREMIUM", "OVERTIME", "NIGHT", "ALLOWANCE", "BONUS", "SERVICE_CHARGE"],
};
export const testEligibility = { sss: true, philhealth: true, pagibig: true, withholding: true, overtime: true, night: true, holiday: true, thirteenthMonth: true, minimumWageExempt: false, exemptionEvidence: "" };
