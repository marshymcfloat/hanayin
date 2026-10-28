import { describe, expect, it } from "vitest";
import { receiptTaxContext } from "@/features/payroll/v2/tax-context";
import { taxableCompensation } from "@/features/payroll/v2/taxable-benefits";
describe("qualified benefits and payment-date context", () => {
  it("shares the annual cap across thirteenth month and supplementary bonuses", () => {
    expect(taxableCompensation([{ amount: "10000", category: "NORMAL" }, { amount: "20000", category: "BENEFITS_CAP" }], "80000", "90000")).toBe("20000.00");
  });
  it("counts actual receipt years and signed reconciliation withholding", () => {
    const result = receiptTaxContext([
      { id: "a", date: "2025-12-31", amount: "100000", category: "EARNING", code: "BONUS", taxCategory: "BENEFITS_CAP" },
      { id: "b", date: "2026-01-02", amount: "20000", category: "EARNING", code: "BONUS", taxCategory: "BENEFITS_CAP" },
      { id: "c", date: "2026-01-16", amount: "10000", category: "EARNING", code: "BONUS", taxCategory: "BENEFITS_CAP" },
      { id: "d", date: "2026-01-16", amount: "2000", category: "DEDUCTION", code: "SSS", taxCategory: "EXEMPT" },
      { id: "e", date: "2026-01-16", amount: "-100", category: "DEDUCTION", code: "TAX_RECONCILIATION", taxCategory: "EXEMPT" },
    ], { year: 2026, date: "2026-01-16", cadence: "SEMIMONTHLY", benefitsCap: "90000", openingBenefits: "75000" });
    expect(result).toEqual({ benefits: "105000.00", yearTaxable: "13000.00", yearWithheld: "-100.00", periodTaxable: "8000.00", periodWithheld: "-100.00" });
  });
});
