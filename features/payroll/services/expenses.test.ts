import { expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: transaction } }));
import { logExpense, reviseExpense, removeExpense } from "@/features/payroll/services/expenses";

it("denies employee contexts for all expense use cases without persistence", async () => {
  const context = { actorType: "EMPLOYEE" } as never;
  const input = { amount: 100, category: "SUPPLIES", businessSlug: "tenant", date: new Date("2026-09-16") } as const;
  expect(await logExpense(context, input)).toEqual({ success: false, error: "Forbidden" });
  expect(await reviseExpense(context, 8, input)).toEqual({ success: false, error: "Forbidden" });
  expect(await removeExpense(context, 8)).toEqual({ success: false, error: "Forbidden" });
  expect(transaction).not.toHaveBeenCalled();
});
