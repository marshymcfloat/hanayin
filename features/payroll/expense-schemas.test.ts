import { describe, expect, it } from "vitest";
import { createExpenseSchema, expenseQuerySchema } from "@/features/payroll/expense-schemas";
import { ExpenseCategory } from "@/prisma/generated/prisma/enums";

const date = new Date("2026-09-16");
describe("expense validation", () => {
  it.each(Object.values(ExpenseCategory))("accepts the stored category %s without rewriting fields", (category) => {
    const input = { businessSlug: "tenant", amount: 0.01, category, date, description: " untrimmed " };
    expect(createExpenseSchema.parse(input)).toEqual(input);
  });
  it.each([undefined, {}, { startDate: date }, { endDate: date }, { startDate: date, endDate: date }])("accepts optional and inclusive range %j", (options) => {
    expect(expenseQuerySchema.safeParse({ businessSlug: "tenant", options }).success).toBe(true);
  });
});
