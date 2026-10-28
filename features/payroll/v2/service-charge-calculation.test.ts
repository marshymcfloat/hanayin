import { describe, expect, it } from "vitest";
import { distributeServiceCharge, serviceChargeRulesSchema } from "./service-charge-calculation";
import { amount, sum } from "@/features/payroll/money";

describe("service-charge complete proportional distribution", () => {
  it("assigns residual cents deterministically regardless of roster order", () => {
    const workers = [3, 1, 2].map(employeeId => ({ employeeId, workedMilliseconds: "3600000" }));
    const result = distributeServiceCharge("100.00", workers);
    expect(result.map(entry => entry.amount)).toEqual(["33.34", "33.33", "33.33"]);
    expect(distributeServiceCharge("100.00", workers.reverse())).toEqual(result);
  });
  it("uses actual work duration and excludes zero worked time", () => {
    expect(distributeServiceCharge("10.00", [{ employeeId: 1, workedMilliseconds: "3600000" }, { employeeId: 2, workedMilliseconds: "10800000" }, { employeeId: 3, workedMilliseconds: "0" }]).map(entry => entry.amount)).toEqual(["2.50", "7.50"]);
  });
  it("reconciles large pools with fractional duration weights", () => {
    const result = distributeServiceCharge("123456789.99", Array.from({ length: 499 }, (_, index) => ({ employeeId: index + 1, workedMilliseconds: String((index + 1) * 713) })));
    expect(amount(sum(result.map(entry => entry.amount)))).toBe("123456789.99");
  });
  it("blocks duplicate recipients, unreviewed durations and empty pools", () => {
    expect(() => distributeServiceCharge("0.00", [{ employeeId: 1, workedMilliseconds: "1" }])).toThrow();
    expect(() => distributeServiceCharge("1.001", [{ employeeId: 1, workedMilliseconds: "1" }])).toThrow();
    expect(() => distributeServiceCharge("1.00", [{ employeeId: 1, workedMilliseconds: "0" }])).toThrow("No confirmed");
    expect(() => distributeServiceCharge("1.00", [{ employeeId: 1, workedMilliseconds: "1" }, { employeeId: 1, workedMilliseconds: "1" }])).toThrow();
  });
  it("rejects unverified source domains and excessive distribution intervals", () => {
    const rule = { version: "SYNTHETIC", taxable: true, maxPeriodDays: 16, source: "https://dole.gov.ph/news/new-rules-on-service-charge-law-out/" };
    expect(serviceChargeRulesSchema.safeParse(rule).success).toBe(true);
    expect(serviceChargeRulesSchema.safeParse({ ...rule, maxPeriodDays: 17 }).success).toBe(false);
    expect(serviceChargeRulesSchema.safeParse({ ...rule, source: "https://example.com" }).success).toBe(false);
  });
});
