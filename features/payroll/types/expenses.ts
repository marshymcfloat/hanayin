import type { ExpenseView } from "@/lib/expenses/constants";

export type ExpenseMutationResult = { success: true } | { success: false; error: string };
export type ExpenseListResult = { success: true; data: ExpenseView[] } | { success: false; error: string };
export type TodayExpenseResult = { success: true; total: number; recentExpenses: ExpenseView[] } | { success: false; error: string };
