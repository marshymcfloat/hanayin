import { amount, decimal, Decimal } from "@/features/payroll/money";
import { qualifiedBenefitsTaxable } from "@/features/payroll/v2/taxable-benefits";
import { taxPeriodKey } from "@/features/payroll/v2/period";

export type TaxReceipt = { date: string; id: string; amount: string; category: string; code: string; taxCategory: string };
export function receiptTaxContext(receipts: TaxReceipt[], input: { year: number; date: string; cadence: string; benefitsCap: string; openingBenefits: string }) {
  let benefits = decimal(input.openingBenefits);
  let yearTaxable = decimal(0); let yearWithheld = decimal(0);
  let periodTaxable = decimal(0); let periodWithheld = decimal(0);
  for (const receipt of [...receipts].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    if (Number(receipt.date.slice(0, 4)) !== input.year || receipt.date > input.date) continue;
    let taxable = decimal(0); let withheld = decimal(0);
    if (receipt.category === "EARNING") {
      if (receipt.taxCategory === "NORMAL") taxable = decimal(receipt.amount);
      if (receipt.taxCategory === "BENEFITS_CAP") {
        taxable = decimal(qualifiedBenefitsTaxable(receipt.amount, amount(benefits), input.benefitsCap));
        benefits = benefits.plus(receipt.amount);
      }
    }
    if (receipt.category === "DEDUCTION" && ["SSS", "PHILHEALTH", "PAGIBIG"].includes(receipt.code)) taxable = taxable.minus(receipt.amount);
    if (receipt.category === "DEDUCTION" && ["BIR", "TAX_RECONCILIATION"].includes(receipt.code)) withheld = decimal(receipt.amount);
    yearTaxable = yearTaxable.plus(taxable); yearWithheld = yearWithheld.plus(withheld);
    if (taxPeriodKey(input.cadence, receipt.date) === taxPeriodKey(input.cadence, input.date)) {
      periodTaxable = periodTaxable.plus(taxable); periodWithheld = periodWithheld.plus(withheld);
    }
  }
  return { benefits: amount(benefits), yearTaxable: amount(yearTaxable), yearWithheld: amount(yearWithheld), periodTaxable: amount(periodTaxable), periodWithheld: amount(periodWithheld) };
}

export function remainingPlanned(amountValue: string, paid: string[]) {
  return amount(decimal(amountValue).minus(paid.reduce((total, value) => total.plus(value), new Decimal(0))));
}
