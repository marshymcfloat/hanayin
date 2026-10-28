import { describe, expect, it } from "vitest";
import { allocateInstallment } from "./payment-allocation";
import { decimal, sum } from "@/features/payroll/money";

describe("installment line allocations", () => {
  const lines = [{ id: "basic", category: "EARNING", amount: "1000.01" }, { id: "commission", category: "EARNING", amount: "50.02" }, { id: "tax", category: "DEDUCTION", amount: "25.01" }];
  it("reconciles each installment exactly and exhausts every line on full settlement", () => {
    const first = allocateInstallment({ net: "1025.02", paid: "0", payment: "300.01", lines, previous: [] });
    const net = (entries: typeof first) => sum(entries.filter(entry => entry.lineId !== "tax").map(entry => entry.amount)).minus(sum(entries.filter(entry => entry.lineId === "tax").map(entry => entry.amount))).toFixed(2);
    expect(net(first)).toBe("300.01");
    const second = allocateInstallment({ net: "1025.02", paid: "300.01", payment: "725.01", lines, previous: first });
    expect(net(second)).toBe("725.01");
    for (const line of lines) expect(decimal(first.find(entry => entry.lineId === line.id)!.amount).plus(second.find(entry => entry.lineId === line.id)!.amount).toFixed(2)).toBe(line.amount);
  });
  it("rejects overpayment and negative installments", () => {
    expect(() => allocateInstallment({ net: "1025.02", paid: "1000", payment: "100", lines, previous: [] })).toThrow("remaining");
    expect(() => allocateInstallment({ net: "1025.02", paid: "0", payment: "-1", lines, previous: [] })).toThrow();
  });
  it("settles a refund-only statement in installments without losing a cent", () => {
    const refunds = [{ id: "a", category: "DEDUCTION", amount: "-0.01" }, { id: "b", category: "DEDUCTION", amount: "-0.01" }];
    const first = allocateInstallment({ net: "0.02", paid: "0", payment: "0.01", lines: refunds, previous: [] });
    const second = allocateInstallment({ net: "0.02", paid: "0.01", payment: "0.01", lines: refunds, previous: first });
    expect(sum(first.map(entry => entry.amount)).negated().toFixed(2)).toBe("0.01");
    expect(sum(second.map(entry => entry.amount)).negated().toFixed(2)).toBe("0.01");
    for (const line of refunds) expect(decimal(first.find(entry => entry.lineId === line.id)!.amount).plus(second.find(entry => entry.lineId === line.id)!.amount).toFixed(2)).toBe(line.amount);
  });
});
