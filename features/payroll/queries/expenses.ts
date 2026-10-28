import "server-only";

import { expenseBusinessWhere, type ExpenseActorContext } from "@/features/payroll/expense-access";
import type { ExpenseQueryOptions } from "@/features/payroll/expense-schemas";
import type { ExpenseListResult, TodayExpenseResult } from "@/features/payroll/types/expenses";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const expenseViewSelect = {
  id: true, amount: true, category: true, description: true, date: true, created_at: true,
  created_by_user: { select: { name: true } },
} satisfies Prisma.ExpenseSelect;
type ExpenseRow = Prisma.ExpenseGetPayload<{ select: typeof expenseViewSelect }>;
function toExpenseView(row: ExpenseRow) {
  return { id: row.id, amount: row.amount, category: row.category, description: row.description,
    date: row.date, created_at: row.created_at, created_by_name: row.created_by_user?.name ?? null };
}

export async function listTenantExpenses(context: ExpenseActorContext, options?: ExpenseQueryOptions): Promise<ExpenseListResult> {
  try {
    const expenses = await prisma.expense.findMany({
      where: { business_id: context.businessId, business: expenseBusinessWhere(context),
        ...(options?.startDate || options?.endDate ? { date: {
          ...(options.startDate ? { gte: options.startDate } : {}), ...(options.endDate ? { lte: options.endDate } : {}),
        } } : {}),
      },
      select: expenseViewSelect, orderBy: [{ date: "desc" }, { created_at: "desc" }], take: options?.limit,
    });
    return { success: true, data: expenses.map(toExpenseView) };
  } catch {
    return { success: false, error: "Failed to fetch expenses." };
  }
}

export async function summarizeTodayExpenses(context: ExpenseActorContext): Promise<TodayExpenseResult> {
  try {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    const where = { business_id: context.businessId, business: expenseBusinessWhere(context), date: { gte: start, lte: end } };
    const [expenses, aggregate] = await Promise.all([
      prisma.expense.findMany({ where, select: expenseViewSelect, orderBy: { created_at: "desc" }, take: 5 }),
      prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { success: true, total: aggregate._sum.amount ?? 0, recentExpenses: expenses.map(toExpenseView) };
  } catch {
    return { success: false, error: "Failed to fetch expense summary." };
  }
}
