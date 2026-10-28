import type { CreateExpenseParams } from "@/lib/expenses/constants";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses/constants";
import { getEndOfDayPH, TIMEZONE_PH } from "@/lib/date-utils";
import type { OwnerDashboardPreviewRankedItem } from "@/features/dashboard/types/owner-dashboard-preview";

export type DashboardExpenseDraft = Omit<CreateExpenseParams, "businessSlug">;

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function manilaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_PH, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return {
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
  };
}

export function manilaDateInputValue(now: Date = new Date()) {
  const { year, month, day } = manilaDateParts(now);
  return `${year}-${month}-${day}`;
}

export function isExpenseInCurrentDashboardMonth(date: Date, now: Date) {
  const { year, month } = manilaDateParts(now);
  const monthStart = new Date(`${year}-${month}-01T00:00:00+08:00`);
  return date >= monthStart && date <= getEndOfDayPH(now);
}

export function optimisticExpenseBreakdown(
  items: OwnerDashboardPreviewRankedItem[],
  expense: DashboardExpenseDraft,
  now: Date,
): { items: OwnerDashboardPreviewRankedItem[]; separate: { name: string; amount: number } | null } {
  if (!isExpenseInCurrentDashboardMonth(expense.date, now)) return { items, separate: null };
  const name = EXPENSE_CATEGORY_LABELS[expense.category];
  const amount = roundCurrency(expense.amount);
  const matchingIndex = items.findIndex((item) => item.name === name);
  if (matchingIndex < 0 && items.length >= 4) return { items, separate: { name, amount } };

  const ranked = matchingIndex < 0
    ? [...items, { name, detail: "Logged operating expenses", value: amount, share: 0 }]
    : items.map((item, index) => index === matchingIndex ? { ...item, value: roundCurrency(item.value + amount) } : item);
  ranked.sort((left, right) => right.value - left.value);
  const total = ranked.reduce((sum, item) => sum + item.value, 0);
  return {
    items: ranked.map((item) => ({ ...item, share: total > 0 ? roundCurrency(item.value / total * 100) : 0 })),
    separate: null,
  };
}
