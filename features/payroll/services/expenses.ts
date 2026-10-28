import "server-only";

import { expenseBusinessWhere, type ExpenseActorContext } from "@/features/payroll/expense-access";
import type { ValidatedExpenseInput } from "@/features/payroll/expense-schemas";
import type { ExpenseMutationResult } from "@/features/payroll/types/expenses";
import { logAudit } from "@/lib/services/audit";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

class ExpenseAccessDenied extends Error {}
class ExpenseConflict extends Error {}
const transactionOptions = { isolationLevel: "Serializable" as const, maxWait: 5000, timeout: 10000 };
const snapshotSelect = { id: true, amount: true, category: true, description: true, date: true, updated_at: true } satisfies Prisma.ExpenseSelect;
type ExpenseSnapshot = Prisma.ExpenseGetPayload<{ select: typeof snapshotSelect }>;

function expenseData(input: ValidatedExpenseInput) {
  return { amount: input.amount, category: input.category, description: input.description?.trim() || null, date: input.date };
}
function auditSnapshot(value: ReturnType<typeof expenseData>) {
  return { amount: value.amount, category: value.category, description: value.description, date: value.date.toISOString() };
}
async function assertCurrentOwner(tx: Prisma.TransactionClient, context: ExpenseActorContext) {
  const actor = await tx.business.findFirst({ where: expenseBusinessWhere(context), select: { id: true } });
  if (!actor) throw new ExpenseAccessDenied();
}
function failure(error: unknown, fallback: string): ExpenseMutationResult {
  if (error instanceof ExpenseAccessDenied) return { success: false, error: "Forbidden" };
  if (error instanceof ExpenseConflict || (typeof error === "object" && error !== null && "code" in error && error.code === "P2034")) {
    return { success: false, error: "Expense changed. Refresh and try again." };
  }
  return { success: false, error: fallback };
}
function expenseWhere(context: ExpenseActorContext, id: number) {
  return { id, business_id: context.businessId, business: expenseBusinessWhere(context) };
}
function expectedExpenseWhere(context: ExpenseActorContext, existing: ExpenseSnapshot) {
  return { ...expenseWhere(context, existing.id), updated_at: existing.updated_at,
    amount: existing.amount, category: existing.category, description: existing.description, date: existing.date };
}

export async function logExpense(context: ExpenseActorContext, input: ValidatedExpenseInput): Promise<ExpenseMutationResult> {
  if (context.actorType !== "OWNER") return { success: false, error: "Forbidden" };
  try {
    return await prisma.$transaction(async tx => {
      await assertCurrentOwner(tx, context);
      const data = expenseData(input);
      const created = await tx.expense.create({
        data: { ...data, business_id: context.businessId, created_by_user_id: context.userId }, select: { id: true },
      });
      await logAudit(tx, {
        entityType: "Expense", entityId: String(created.id), action: "CREATED",
        actorId: context.userId, businessId: context.businessId,
        changes: { after: { ...auditSnapshot(data), mode: "EXPENSE_LOGGED" } },
      });
      return { success: true as const };
    }, transactionOptions);
  } catch (error) {
    return failure(error, "Failed to log expense.");
  }
}

export async function reviseExpense(context: ExpenseActorContext, id: number, input: ValidatedExpenseInput): Promise<ExpenseMutationResult> {
  if (context.actorType !== "OWNER") return { success: false, error: "Forbidden" };
  try {
    return await prisma.$transaction(async tx => {
      await assertCurrentOwner(tx, context);
      const existing = await tx.expense.findFirst({ where: expenseWhere(context, id), select: snapshotSelect });
      if (!existing) return { success: false as const, error: "Expense not found." };
      const data = expenseData(input);
      const result = await tx.expense.updateMany({ where: expectedExpenseWhere(context, existing), data });
      if (result.count !== 1) throw new ExpenseConflict();
      await logAudit(tx, {
        entityType: "Expense", entityId: String(existing.id), action: "UPDATED",
        actorId: context.userId, businessId: context.businessId,
        changes: { before: auditSnapshot(existing), after: { ...auditSnapshot(data), mode: "EXPENSE_REVISED" } },
      });
      return { success: true as const };
    }, transactionOptions);
  } catch (error) {
    return failure(error, "Failed to update expense.");
  }
}

export async function removeExpense(context: ExpenseActorContext, id: number): Promise<ExpenseMutationResult> {
  if (context.actorType !== "OWNER") return { success: false, error: "Forbidden" };
  try {
    return await prisma.$transaction(async tx => {
      await assertCurrentOwner(tx, context);
      const existing = await tx.expense.findFirst({ where: expenseWhere(context, id), select: snapshotSelect });
      if (!existing) return { success: false as const, error: "Expense not found." };
      const result = await tx.expense.deleteMany({ where: expectedExpenseWhere(context, existing) });
      if (result.count !== 1) throw new ExpenseConflict();
      await logAudit(tx, {
        entityType: "Expense", entityId: String(existing.id), action: "CANCELLED",
        actorId: context.userId, businessId: context.businessId,
        changes: { before: auditSnapshot(existing), after: { mode: "EXPENSE_DELETED" } },
      });
      return { success: true as const };
    }, transactionOptions);
  } catch (error) {
    return failure(error, "Failed to delete expense.");
  }
}
