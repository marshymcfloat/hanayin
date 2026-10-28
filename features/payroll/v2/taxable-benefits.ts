import { amount, decimal, sum, Decimal } from "@/features/payroll/money";
export function qualifiedBenefitsTaxable(current: string, alreadyReceived: string, cap: string) {
  return amount(Decimal.max(0, decimal(current).minus(Decimal.max(0, decimal(cap).minus(alreadyReceived)))));
}
export function taxableCompensation(lines: { amount: string; category: string }[], priorBenefits: string, cap: string) {
  return amount(sum(lines.filter(line => line.category === "NORMAL").map(line => line.amount)).plus(qualifiedBenefitsTaxable(amount(sum(lines.filter(line => line.category === "BENEFITS_CAP").map(line => line.amount))), priorBenefits, cap)));
}
