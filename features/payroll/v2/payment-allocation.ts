import { amount, decimal, money, sum } from "@/features/payroll/money";
import { PayrollError } from "./contracts";

export function allocateInstallment(input: {
  net: string; paid: string; payment: string;
  lines: { id: string; category: string; amount: string }[];
  previous: { lineId: string; amount: string }[];
}) {
  const nextPaid = decimal(input.paid).plus(input.payment);
  if (decimal(input.payment).lte(0) || nextPaid.gt(input.net) || decimal(input.net).lte(0)) throw new PayrollError("INVALID_INPUT", "Payment exceeds the remaining balance.");
  const ratio = nextPaid.div(input.net);
  const allocations = input.lines.map(line => {
    const previous = sum(input.previous.filter(entry => entry.lineId === line.id).map(entry => entry.amount));
    return { lineId: line.id, category: line.category, amount: amount(money(decimal(line.amount).times(ratio)).minus(previous)) };
  });
  const allocatedNet = sum(allocations.filter(entry => entry.category === "EARNING").map(entry => entry.amount)).minus(sum(allocations.filter(entry => entry.category === "DEDUCTION").map(entry => entry.amount)));
  const correction = decimal(input.payment).minus(allocatedNet);
  const earning = allocations.filter(entry => entry.category === "EARNING").sort((a, b) => decimal(b.amount).cmp(a.amount))[0];
  const refund = allocations.filter(entry => entry.category === "DEDUCTION" && decimal(entry.amount).isNegative()).sort((a, b) => decimal(a.amount).cmp(b.amount))[0];
  if (!earning && !refund && !correction.isZero()) throw new PayrollError("BLOCKED", "Payment line reconciliation is required.");
  if (earning) earning.amount = amount(decimal(earning.amount).plus(correction));
  else if (refund) refund.amount = amount(decimal(refund.amount).minus(correction));
  if (ratio.eq(1) && !correction.isZero()) {
    // Final settlement must exactly exhaust all immutable line balances.
    const totalOriginal = sum(input.lines.filter(line => line.category === "EARNING").map(line => line.amount)).minus(sum(input.lines.filter(line => line.category === "DEDUCTION").map(line => line.amount)));
    if (!money(totalOriginal).eq(input.net)) throw new PayrollError("BLOCKED", "The published line totals need reconciliation.");
  }
  return allocations.map(({ lineId, amount: value }) => ({ lineId, amount: value }));
}
