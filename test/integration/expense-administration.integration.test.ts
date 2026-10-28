import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { logExpense, reviseExpense, removeExpense } from "@/features/payroll/services/expenses";
import { summarizeTodayExpenses } from "@/features/payroll/queries/expenses";
import type { ExpenseOwnerContext } from "@/features/payroll/expense-access";
import type { ExpenseMutationResult } from "@/features/payroll/types/expenses";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { ExpenseCategory, Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failAudit: false, arrive: null as null | (() => Promise<void>) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/audit", async original => {
  const actual = await original<typeof import("@/lib/services/audit")>();
  return { ...actual, logAudit: async (...args: Parameters<typeof actual.logAudit>) => {
    if (controls.failAudit) throw new Error("Fixture audit failure");
    return actual.logAudit(...args);
  } };
});
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, {
    get(client, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) =>
        client.$transaction(tx => work(new Proxy(tx, {
          get(transaction, member) {
            if (member !== "expense") return Reflect.get(transaction, member);
            return new Proxy(transaction.expense, {
              get(expense, operation) {
                if (operation === "findFirst") return async (args: Prisma.ExpenseFindFirstArgs) => {
                  const result = await expense.findFirst(args);
                  if (controls.arrive) await controls.arrive();
                  return result;
                };
                const value = Reflect.get(expense, operation);
                return typeof value === "function" ? value.bind(expense) : value;
              },
            });
          },
        })), options);
      const value = Reflect.get(client, key);
      return typeof value === "function" ? value.bind(client) : value;
    },
  }) };
});
requireTestDatabase();

const factory = createSharedWorkflowFactory({ namespace: `integration-expenses-${randomUUID()}` });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const user = factory.user({ contactNumber: `test-expense-${randomUUID()}` });
const tenantIds = [business.id, foreign.id];
const date = new Date("2030-01-15T09:00:00.000Z");
const input = { businessSlug: business.slug, amount: 100, category: Object.values(ExpenseCategory)[0], description: " Fixture expense ", date };
let context: ExpenseOwnerContext;
const audits = () => prisma.auditLog.findMany({ where: { business_id: business.id }, orderBy: { created_at: "asc" } });
const fixtureExpense = (businessId = business.id) => prisma.expense.create({ data: { business_id: businessId, amount: 100, category: input.category, description: "Original", date, created_by_user_id: user.id } });

async function race(left: () => Promise<ExpenseMutationResult>, right: () => Promise<ExpenseMutationResult>) {
  let arrivals = 0;
  let release!: () => void;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const gate = new Promise<void>((resolve, reject) => {
    release = resolve;
    timeout = setTimeout(() => reject(new Error("Concurrent fixture requires two transaction connections")), 5000);
  });
  controls.arrive = async () => { if (++arrivals === 2) { clearTimeout(timeout); release(); } await gate; };
  try {
    const results = await Promise.all([left(), right()]);
    expect(arrivals).toBe(2);
    expect(results.filter(result => result.success)).toHaveLength(1);
    expect(results.find(result => !result.success)).toEqual({ success: false, error: "Expense changed. Refresh and try again." });
    expect(await audits()).toHaveLength(1);
    return results;
  } finally { controls.arrive = null; clearTimeout(timeout); }
}

describe("audited tenant expenses in PostgreSQL", () => {
  beforeAll(async () => {
    for (const fixture of [business, foreign]) await prisma.business.create({ data: { id: fixture.id, slug: fixture.slug, name: fixture.name, initials: fixture.initials } });
    await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: Role.OWNER } });
    const owner = await prisma.owner.create({ data: { user_id: user.id, business_id: business.id } });
    context = { success: true, actorType: "OWNER", role: Role.OWNER, ownerId: owner.id, userId: user.id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(date);
  });
  beforeEach(async () => {
    controls.failAudit = false;
    controls.arrive = null;
    await prisma.auditLog.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.expense.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.user.update({ where: { id: user.id }, data: { role: Role.OWNER } });
  });
  afterAll(async () => {
    controls.failAudit = false;
    controls.arrive = null;
    vi.useRealTimers();
    let failures = 0;
    try {
      for (const cleanup of [
        () => prisma.auditLog.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.expense.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.business.deleteMany({ where: { id: { in: tenantIds } } }),
        () => prisma.user.deleteMany({ where: { id: user.id } }),
      ]) { try { await cleanup(); } catch { failures++; } }
    } finally { await prisma.$disconnect(); }
    if (failures) throw new Error(`Fixture cleanup failed in ${failures} steps`);
  });

  it("commits each financial transition with verified-actor audit and trimmed description", async () => {
    expect(await logExpense(context, input)).toEqual({ success: true });
    const created = await prisma.expense.findFirstOrThrow({ where: { business_id: business.id } });
    expect(created).toMatchObject({ amount: 100, description: "Fixture expense", created_by_user_id: user.id });
    expect(await reviseExpense(context, created.id, { ...input, amount: 200 })).toEqual({ success: true });
    expect(await removeExpense(context, created.id)).toEqual({ success: true });
    expect(await prisma.expense.count({ where: { business_id: business.id } })).toBe(0);
    const logs = await audits();
    expect(logs).toHaveLength(3);
    expect(logs.map(log => log.action)).toEqual(["CREATED", "UPDATED", "CANCELLED"]);
    expect(logs.every(log => log.actor_id === user.id && log.entity_id === String(created.id))).toBe(true);
    const initial = { amount: 100, category: input.category, description: "Fixture expense", date: date.toISOString() };
    const revised = { ...initial, amount: 200 };
    expect(logs.map(log => log.changes)).toEqual([
      { after: { ...initial, mode: "EXPENSE_LOGGED" } },
      { before: initial, after: { ...revised, mode: "EXPENSE_REVISED" } },
      { before: revised, after: { mode: "EXPENSE_DELETED" } },
    ]);
  });

  it.each(["create", "update", "delete"])("rolls %s back when its audit fails", async mode => {
    const prior = mode === "create" ? null : await fixtureExpense();
    controls.failAudit = true;
    const result = mode === "create" ? await logExpense(context, input) : mode === "update" ? await reviseExpense(context, prior!.id, { ...input, amount: 200 }) : await removeExpense(context, prior!.id);
    expect(result.success).toBe(false);
    expect(await prisma.expense.findMany({ where: { business_id: business.id } })).toEqual(prior ? [prior] : []);
    expect(await audits()).toEqual([]);
  });

  it("denies foreign targets without changing their financial state", async () => {
    const prior = await fixtureExpense(foreign.id);
    expect(await reviseExpense(context, prior.id, input)).toEqual({ success: false, error: "Expense not found." });
    expect(await removeExpense(context, prior.id)).toEqual({ success: false, error: "Expense not found." });
    expect(await prisma.expense.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
    expect(await audits()).toEqual([]);
  });

  it("rechecks current owner role after context resolution", async () => {
    const prior = await fixtureExpense();
    await prisma.user.update({ where: { id: user.id }, data: { role: Role.EMPLOYEE } });
    expect(await logExpense(context, input)).toEqual({ success: false, error: "Forbidden" });
    expect(await reviseExpense(context, prior.id, input)).toEqual({ success: false, error: "Forbidden" });
    expect(await removeExpense(context, prior.id)).toEqual({ success: false, error: "Forbidden" });
    expect(await prisma.expense.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
    expect(await audits()).toEqual([]);
  });

  it("sums the entire local day while returning only five recent safe DTOs", async () => {
    for (let index = 0; index < 7; index++) await fixtureExpense();
    await fixtureExpense(foreign.id);
    await prisma.expense.create({ data: { business_id: business.id, amount: 900, category: input.category, date: new Date("2030-01-13T09:00:00.000Z") } });
    const summary = await summarizeTodayExpenses(context);
    expect(summary.success).toBe(true);
    if (!summary.success) throw new Error("Fixture summary failed");
    expect(summary.total).toBe(700);
    expect(summary.recentExpenses).toHaveLength(5);
    expect(Object.keys(summary.recentExpenses[0]).sort()).toEqual(["amount", "category", "created_at", "created_by_name", "date", "description", "id"]);
  });

  it.each(["two revisions", "revision and deletion"])("commits exactly one of %s from the same snapshot", async mode => {
    const prior = await fixtureExpense();
    const results = await race(() => reviseExpense(context, prior.id, { ...input, amount: 200 }), () => mode === "two revisions" ? reviseExpense(context, prior.id, { ...input, amount: 300 }) : removeExpense(context, prior.id));
    const stored = await prisma.expense.findUnique({ where: { id: prior.id } });
    const deleted = mode === "revision and deletion" && results[1].success;
    const winningAmount = results[0].success ? 200 : 300;
    if (deleted) expect(stored).toBeNull();
    else expect(stored?.amount).toBe(winningAmount);
    const [audit] = await audits();
    expect(audit).toMatchObject({ actor_id: user.id, entity_id: String(prior.id), action: deleted ? "CANCELLED" : "UPDATED" });
    expect(audit.changes).toEqual({
      before: { amount: 100, category: input.category, description: "Original", date: date.toISOString() },
      after: deleted ? { mode: "EXPENSE_DELETED" } : { amount: winningAmount, category: input.category, description: "Fixture expense", date: date.toISOString(), mode: "EXPENSE_REVISED" },
    });
  }, 15000);

  it("includes both exact local-day edges and excludes adjacent milliseconds", async () => {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    for (const boundary of [start, end, new Date(start.getTime() - 1), new Date(end.getTime() + 1)]) {
      await prisma.expense.create({ data: { business_id: business.id, amount: 100, category: input.category, date: boundary } });
    }
    const summary = await summarizeTodayExpenses(context);
    expect(summary).toEqual({ success: true, total: 200, recentExpenses: expect.arrayContaining([expect.objectContaining({ date: start }), expect.objectContaining({ date: end })]) });
    if (!summary.success) throw new Error("Fixture summary failed");
    expect(summary.recentExpenses).toHaveLength(2);
  });
});
