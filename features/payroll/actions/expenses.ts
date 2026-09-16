"use server";

// Feature-owned Server Action boundary.

import { revalidatePath } from "next/cache";
import { prisma } from "@/prisma/prisma";
import { requireOwnerTenantWriteAccess, requireTenantAccess } from "@/lib/auth/guards";
import type {
  CreateExpenseParams,
  UpdateExpenseParams,
  ExpenseView,
} from "@/lib/expenses/constants";

export type { CreateExpenseParams, UpdateExpenseParams, ExpenseView } from "@/lib/expenses/constants";

export async function createExpense(params: CreateExpenseParams) {
  const auth = await requireOwnerTenantWriteAccess(params.businessSlug);
  if (!auth.success) return auth;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: params.businessSlug },
      select: { id: true },
    });
    if (!business) return { success: false, error: "Business not found." };

    if (params.amount <= 0) {
      return { success: false, error: "Amount must be greater than 0." };
    }

    await prisma.expense.create({
      data: {
        business_id: business.id,
        amount: params.amount,
        category: params.category,
        description: params.description?.trim() || null,
        date: params.date,
        created_by_user_id: auth.session.user.id,
      },
    });

    revalidatePath(`/app/${params.businessSlug}`);
    revalidatePath(`/app/${params.businessSlug}/reports`);
    return { success: true };
  } catch (error) {
    console.error("Error creating expense:", error);
    return { success: false, error: "Failed to log expense." };
  }
}

export async function updateExpense(params: UpdateExpenseParams) {
  const auth = await requireOwnerTenantWriteAccess(params.businessSlug);
  if (!auth.success) return auth;

  try {
    const existing = await prisma.expense.findFirst({
      where: { id: params.id, business: { slug: params.businessSlug } },
      select: { id: true },
    });
    if (!existing) return { success: false, error: "Expense not found." };

    if (params.amount <= 0) {
      return { success: false, error: "Amount must be greater than 0." };
    }

    await prisma.expense.update({
      where: { id: existing.id },
      data: {
        amount: params.amount,
        category: params.category,
        description: params.description?.trim() || null,
        date: params.date,
      },
    });

    revalidatePath(`/app/${params.businessSlug}/reports`);
    return { success: true };
  } catch (error) {
    console.error("Error updating expense:", error);
    return { success: false, error: "Failed to update expense." };
  }
}

export async function deleteExpense(id: number, businessSlug: string) {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) return auth;

  try {
    const deleted = await prisma.expense.deleteMany({
      where: { id, business: { slug: businessSlug } },
    });
    if (deleted.count === 0) return { success: false, error: "Expense not found." };

    revalidatePath(`/app/${businessSlug}/reports`);
    return { success: true };
  } catch (error) {
    console.error("Error deleting expense:", error);
    return { success: false, error: "Failed to delete expense." };
  }
}

export async function getExpenses(
  businessSlug: string,
  options?: { startDate?: Date; endDate?: Date; limit?: number },
): Promise<{ success: true; data: ExpenseView[] } | { success: false; error: string }> {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
      select: { id: true },
    });
    if (!business) return { success: false, error: "Business not found." };

    const expenses = await prisma.expense.findMany({
      where: {
        business_id: business.id,
        ...(options?.startDate || options?.endDate
          ? {
              date: {
                ...(options.startDate ? { gte: options.startDate } : {}),
                ...(options.endDate ? { lte: options.endDate } : {}),
              },
            }
          : {}),
      },
      include: {
        created_by_user: { select: { name: true } },
      },
      orderBy: [{ date: "desc" }, { created_at: "desc" }],
      take: options?.limit,
    });

    return {
      success: true,
      data: expenses.map((e) => ({
        id: e.id,
        amount: e.amount,
        category: e.category,
        description: e.description,
        date: e.date,
        created_at: e.created_at,
        created_by_name: e.created_by_user?.name ?? null,
      })),
    };
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return { success: false, error: "Failed to fetch expenses." };
  }
}

export async function getTodayExpenseSummary(businessSlug: string): Promise<{
  success: true;
  total: number;
  recentExpenses: ExpenseView[];
} | { success: false; error: string }> {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return { success: false, error: "Unauthorized" };

  try {
    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
      select: { id: true },
    });
    if (!business) return { success: false, error: "Business not found." };

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const expenses = await prisma.expense.findMany({
      where: {
        business_id: business.id,
        date: { gte: startOfDay, lte: endOfDay },
      },
      include: { created_by_user: { select: { name: true } } },
      orderBy: { created_at: "desc" },
      take: 5,
    });

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      success: true,
      total,
      recentExpenses: expenses.map((e) => ({
        id: e.id,
        amount: e.amount,
        category: e.category,
        description: e.description,
        date: e.date,
        created_at: e.created_at,
        created_by_name: e.created_by_user?.name ?? null,
      })),
    };
  } catch (error) {
    console.error("Error fetching today expense summary:", error);
    return { success: false, error: "Failed to fetch expense summary." };
  }
}
