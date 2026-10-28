"use server";

import { revalidatePath } from "next/cache";
import { requireExpenseAccess } from "@/features/payroll/expense-access";
import { createExpenseSchema, updateExpenseSchema, deleteExpenseSchema, expenseQuerySchema } from "@/features/payroll/expense-schemas";
import { logExpense, reviseExpense, removeExpense } from "@/features/payroll/services/expenses";
import { listTenantExpenses, summarizeTodayExpenses } from "@/features/payroll/queries/expenses";
import type { ExpenseMutationResult, ExpenseListResult, TodayExpenseResult } from "@/features/payroll/types/expenses";
import type { CreateExpenseParams, UpdateExpenseParams } from "@/lib/expenses/constants";

export type { CreateExpenseParams, UpdateExpenseParams, ExpenseView } from "@/lib/expenses/constants";

export async function createExpense(params: CreateExpenseParams): Promise<ExpenseMutationResult> {
  const input = createExpenseSchema.safeParse(params);
  if (!input.success) return { success: false, error: input.error.issues[0]?.message === "Amount must be greater than 0." ? "Amount must be greater than 0." : "Invalid input" };
  try {
    const access = await requireExpenseAccess(input.data.businessSlug, true);
    if (!access.success) return access;
    const result = await logExpense(access.context, input.data);
    if (result.success) {
      revalidatePath(`/app/${access.context.businessSlug}`);
      revalidatePath(`/app/${access.context.businessSlug}/reports`);
    }
    return result;
  } catch {
    return { success: false, error: "Failed to log expense." };
  }
}

export async function updateExpense(params: UpdateExpenseParams): Promise<ExpenseMutationResult> {
  const input = updateExpenseSchema.safeParse(params);
  if (!input.success) return { success: false, error: input.error.issues[0]?.message === "Amount must be greater than 0." ? "Amount must be greater than 0." : "Invalid input" };
  try {
    const access = await requireExpenseAccess(input.data.businessSlug, true);
    if (!access.success) return access;
    const result = await reviseExpense(access.context, input.data.id, input.data);
    if (result.success) revalidatePath(`/app/${access.context.businessSlug}/reports`);
    return result;
  } catch {
    return { success: false, error: "Failed to update expense." };
  }
}

export async function deleteExpense(id: number, businessSlug: string): Promise<ExpenseMutationResult> {
  const input = deleteExpenseSchema.safeParse({ id, businessSlug });
  if (!input.success) return { success: false, error: "Invalid input" };
  try {
    const access = await requireExpenseAccess(input.data.businessSlug, true);
    if (!access.success) return access;
    const result = await removeExpense(access.context, input.data.id);
    if (result.success) revalidatePath(`/app/${access.context.businessSlug}/reports`);
    return result;
  } catch {
    return { success: false, error: "Failed to delete expense." };
  }
}

export async function getExpenses(businessSlug: string, options?: { startDate?: Date; endDate?: Date; limit?: number }): Promise<ExpenseListResult> {
  const input = expenseQuerySchema.safeParse({ businessSlug, options });
  if (!input.success) return { success: false, error: "Invalid input" };
  try {
    const access = await requireExpenseAccess(input.data.businessSlug);
    if (!access.success) return access;
    return await listTenantExpenses(access.context, input.data.options);
  } catch {
    return { success: false, error: "Failed to fetch expenses." };
  }
}

export async function getTodayExpenseSummary(businessSlug: string): Promise<TodayExpenseResult> {
  const input = expenseQuerySchema.safeParse({ businessSlug });
  if (!input.success) return { success: false, error: "Invalid input" };
  try {
    const access = await requireExpenseAccess(input.data.businessSlug);
    if (!access.success) return { success: false, error: "Unauthorized" };
    return await summarizeTodayExpenses(access.context);
  } catch {
    return { success: false, error: "Failed to fetch expense summary." };
  }
}
