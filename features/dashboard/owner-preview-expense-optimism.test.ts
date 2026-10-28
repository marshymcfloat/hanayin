import { describe, expect, it } from "vitest";
import { ExpenseCategory } from "@/prisma/generated/prisma/enums";
import type { OwnerDashboardPreviewRankedItem } from "@/features/dashboard/types/owner-dashboard-preview";
import { isExpenseInCurrentDashboardMonth, manilaDateInputValue, optimisticExpenseBreakdown } from "./owner-preview-expense-optimism";

const now = new Date("2026-10-03T05:00:00.000Z");
const date = (value: string) => new Date(`${value}T00:00:00+08:00`);
const draft = (category: ExpenseCategory, amount: number, selectedDate = date("2026-10-03")) => ({ category, amount, date: selectedDate });

describe("owner expense preview", () => {
  it("uses Manila dates and excludes previous-month and future expenses", () => {
    expect(manilaDateInputValue(new Date("2026-09-30T16:15:00.000Z"))).toBe("2026-10-01");
    expect(isExpenseInCurrentDashboardMonth(date("2026-10-01"), now)).toBe(true);
    expect(isExpenseInCurrentDashboardMonth(date("2026-09-30"), now)).toBe(false);
    expect(isExpenseInCurrentDashboardMonth(date("2026-10-04"), now)).toBe(false);
    const original = [{ name: "Supplies", detail: "Logged operating expenses", value: 50, share: 100 }];
    expect(optimisticExpenseBreakdown(original, draft(ExpenseCategory.RENT, 25, date("2026-09-30")), now).items).toBe(original);
    expect(optimisticExpenseBreakdown(original, draft(ExpenseCategory.RENT, 25, date("2026-10-04")), now).items).toBe(original);
  });

  it("adds to a visible category and recalculates shares among the displayed rows", () => {
    const items: OwnerDashboardPreviewRankedItem[] = [
      { name: "Team payroll", detail: "1 paid payslip", value: 100, share: 50 },
      { name: "Supplies", detail: "Logged operating expenses", value: 50, share: 25 },
      { name: "Utilities", detail: "Logged operating expenses", value: 50, share: 25 },
    ];
    expect(optimisticExpenseBreakdown(items, draft(ExpenseCategory.SUPPLIES, 50), now)).toEqual({
      items: [
        { ...items[0], share: 40 },
        { ...items[1], value: 100, share: 40 },
        { ...items[2], share: 20 },
      ],
      separate: null,
    });
    expect(items[1].value).toBe(50);
  });

  it("creates the first category and shows exact cents", () => {
    expect(optimisticExpenseBreakdown([], draft(ExpenseCategory.SUPPLIES, 125.5), now)).toEqual({
      items: [{ name: "Supplies", detail: "Logged operating expenses", value: 125.5, share: 100 }],
      separate: null,
    });
  });

  it("keeps four authoritative rows intact when an unseen category could have a hidden total", () => {
    const items: OwnerDashboardPreviewRankedItem[] = [
      { name: "Team payroll", detail: "1 paid payslip", value: 400, share: 40 },
      { name: "Supplies", detail: "Logged operating expenses", value: 300, share: 30 },
      { name: "Utilities", detail: "Logged operating expenses", value: 200, share: 20 },
      { name: "Rent", detail: "Logged operating expenses", value: 100, share: 10 },
    ];
    expect(optimisticExpenseBreakdown(items, draft(ExpenseCategory.MARKETING, 80), now)).toEqual({
      items,
      separate: { name: "Marketing", amount: 80 },
    });
  });
});
