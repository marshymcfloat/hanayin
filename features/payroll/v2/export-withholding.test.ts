import { describe, expect, it } from "vitest";
import { aggregatePaidWithholding, exportMonthBounds, publishedExportIdentity, type WithholdingPayment } from "./export-withholding";

const snapshot = { employeeName: "Published employee name", evidence: { profile: { encrypted_identifiers: "SYNTHETIC_CIPHERTEXT_ONLY" } } };
const payment: WithholdingPayment = { id: "first", employeeId: 1, date: "2026-10-03", amount: "50.00", legacy: false, snapshot, rulePackageId: "SYNTHETIC", allocations: [{ id: "basic", code: "BASIC", category: "EARNING", amount: "55.00" }, { id: "tax", code: "BIR", category: "DEDUCTION", amount: "5.00" }] };
describe("actual-payment withholding exports", () => {
  it("reports late payments in their actual month and installment proportions", () => {
    const next = { ...payment, id: "second", date: "2026-11-02" };
    expect(aggregatePaidWithholding([payment, next], "2026-09")).toEqual([]);
    expect(aggregatePaidWithholding([payment, next], "2026-10")[0].employeeShare).toBe("5.00");
    expect(aggregatePaidWithholding([payment, next], "2026-11")[0].employeeShare).toBe("5.00");
  });
  it("preserves signed tax reconciliation refunds when paid", () => {
    const refund: WithholdingPayment = { ...payment, id: "refund", amount: "53.00", allocations: [{ id: "basic", code: "BASIC", category: "EARNING", amount: "50.00" }, { id: "refund-tax", code: "TAX_RECONCILIATION", category: "DEDUCTION", amount: "-3.00" }] };
    expect(aggregatePaidWithholding([payment, refund], "2026-10")[0].employeeShare).toBe("2.00");
  });
  it("does not attribute other deductions or employer costs to employee withholding", () => {
    const other = { ...payment, allocations: [...payment.allocations, { id: "contrib", code: "SSS", category: "DEDUCTION", amount: "2.00" }, { id: "employer", code: "BIR", category: "EMPLOYER", amount: "3.00" }], amount: "48.00" };
    expect(() => aggregatePaidWithholding([other], "2026-10")).toThrow("classification");
    expect(aggregatePaidWithholding([{ ...other, allocations: other.allocations.filter(entry => entry.id !== "employer") }], "2026-10")[0].employeeShare).toBe("5.00");
  });
  it("fails closed for legacy or unitemized payments without inventing withheld tax", () => {
    expect(() => aggregatePaidWithholding([{ ...payment, legacy: true }], "2026-10")).toThrow("Legacy");
    expect(() => aggregatePaidWithholding([{ ...payment, allocations: [] }], "2026-10")).toThrow("missing");
    expect(aggregatePaidWithholding([{ ...payment, legacy: true }], "2026-10", false)[0]).toMatchObject({ employeeShare: "0.00", issues: ["Legacy payment has no verified itemized withholding."] });
  });
  it("rejects duplicate evidence and inconsistent installment balances", () => {
    expect(() => aggregatePaidWithholding([payment, payment], "2026-10")).toThrow("Duplicate");
    expect(() => aggregatePaidWithholding([{ ...payment, amount: "50.01" }], "2026-10")).toThrow("reconcile");
    expect(() => aggregatePaidWithholding([{ ...payment, allocations: [payment.allocations[0], payment.allocations[0]] }], "2026-10")).toThrow("reconcile");
  });
  it("requires historical snapshot identifiers and preserves the published name", () => {
    expect(publishedExportIdentity(snapshot)).toEqual({ name: "Published employee name", encryptedIdentifiers: "SYNTHETIC_CIPHERTEXT_ONLY" });
    expect(publishedExportIdentity({ employeeName: "Current name", encrypted_identifiers: "CURRENT_PROFILE" })).toBeNull();
    expect(publishedExportIdentity({ ...snapshot, evidence: {} })).toBeNull();
  });
  it("calculates month bounds in UTC across leap years and validates months", () => {
    expect(exportMonthBounds("2024-02")).toEqual({ first: "2024-02-01", last: "2024-02-29", next: "2024-03-01" });
    expect(exportMonthBounds("2026-12").next).toBe("2027-01-01");
    expect(() => exportMonthBounds("2026-13")).toThrow("valid");
  });
});
