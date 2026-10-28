import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), resolve: vi.fn(), business: vi.fn(), businessUpdate: vi.fn(), create: vi.fn(), update: vi.fn(),
  findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn(), cache: vi.fn(), transaction: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireOwnerTenantWriteAccess: mocks.auth, requireTenantAccess: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.resolve }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/lib/services/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/prisma/prisma", () => ({ prisma: {
  business: { findUnique: mocks.business, update: mocks.businessUpdate },
  expense: { create: mocks.create, update: mocks.update, findFirst: mocks.findFirst, findMany: mocks.findMany,
    deleteMany: mocks.deleteMany, updateMany: mocks.updateMany, aggregate: mocks.aggregate },
  $transaction: mocks.transaction,
} }));
import { createExpense, updateExpense, deleteExpense, getExpenses, getTodayExpenseSummary } from "@/features/payroll/actions/expenses";

const date = new Date("2026-09-16T02:00:00Z");
const params = { businessSlug: "tenant", amount: 100, category: "SUPPLIES" as const, description: "  paper  ", date };
const row = { id: 8, amount: 100, category: "SUPPLIES", description: "paper", date, created_at: date, created_by_user: { name: "Owner" }, business_id: "private" };
const context = { success: true, actorType: "OWNER", role: "OWNER", ownerId: 7, userId: "actor", businessId: "business", businessSlug: "tenant" };
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, session: { user: { id: "actor", role: "OWNER" } }, businessSlug: "tenant" });
  mocks.resolve.mockResolvedValue(context);
  mocks.business.mockResolvedValue({ id: "business" });
  mocks.findFirst.mockResolvedValue({ id: 8, amount: 50, category: "SUPPLIES", description: "old", date, updated_at: date });
  mocks.create.mockResolvedValue({ id: 8 });
  mocks.transaction.mockImplementation(async (callback) => callback({ business: { findFirst: mocks.business },
    expense: { create: mocks.create, findFirst: mocks.findFirst, updateMany: mocks.updateMany, deleteMany: mocks.deleteMany } }));
  mocks.findMany.mockResolvedValue([row]);
  mocks.deleteMany.mockResolvedValue({ count: 1 });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.aggregate.mockResolvedValue({ _sum: { amount: 100 } });
});

describe("expense boundary and tenant protections", () => {
  it.each([NaN, Infinity, -Infinity, "100", null])("rejects non-finite or non-number amount %s", async (amount) => {
    expect(await createExpense({ ...params, amount } as never)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([0, -1])("keeps the positive amount message %s", async (amount) => {
    expect(await createExpense({ ...params, amount })).toEqual({ success: false, error: "Amount must be greater than 0." });
    expect(await updateExpense({ ...params, id: 8, amount })).toEqual({ success: false, error: "Amount must be greater than 0." });
  });
  it.each([0, -1, 1.5, 2147483648, NaN, Infinity, "8"]) ("rejects malformed expense id %s", async (id) => {
    expect(await updateExpense({ ...params, id } as never)).toEqual({ success: false, error: "Invalid input" });
    expect(await deleteExpense(id as number, "tenant")).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each([
    { category: "OTHER" }, { description: "x".repeat(2001) }, { date: new Date(NaN) },
    { date: "2026-09-16" }, { businessSlug: "../foreign" }, { businessSlug: "x".repeat(201) },
  ])("rejects malformed expense payload %j", async (change) => {
    expect(await createExpense({ ...params, ...change } as never)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each([
    { limit: 0 }, { limit: -1 }, { limit: 1.5 }, { limit: 1001 }, { limit: Infinity },
    { startDate: new Date(NaN) }, { endDate: "today" },
    { startDate: new Date("2026-09-17"), endDate: new Date("2026-09-16") },
  ])("rejects malformed range or limit %j", async (options) => {
    expect(await getExpenses("tenant", options as never)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each(["Unauthorized", "Forbidden", "Subscription is read-only"]) ("returns guard denial without writes: %s", async (error) => {
    mocks.auth.mockResolvedValue({ success: false, error });
    expect(await createExpense(params)).toEqual({ success: false, error });
    expect(await updateExpense({ ...params, id: 8 })).toEqual({ success: false, error });
    expect(await deleteExpense(8, "tenant")).toEqual({ success: false, error });
    expect(await getExpenses("tenant")).toEqual({ success: false, error });
    expect(await getTodayExpenseSummary("tenant")).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("rejects stale owner context that now resolves to an employee", async () => {
    mocks.resolve.mockResolvedValue({ ...context, actorType: "EMPLOYEE", role: "EMPLOYEE", employeeId: 10, ownerId: null });
    expect(await createExpense(params)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("accepts current tenant employees for reads with a current employee-role predicate", async () => {
    mocks.resolve.mockResolvedValue({ ...context, actorType: "EMPLOYEE", role: "EMPLOYEE", employeeId: 10, ownerId: null });
    expect((await getExpenses("tenant")).success).toBe(true);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      business_id: "business", business: { id: "business", slug: "tenant",
        employees: { some: { id: 10, user_id: "actor", business_id: "business", user: { role: "EMPLOYEE" } } } },
    } }));
  });
  it("rejects removed or foreign current actor membership before expense queries", async () => {
    mocks.resolve.mockResolvedValue({ success: false, error: "Forbidden" });
    expect(await getExpenses("tenant")).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("scopes create and its audit to verified tenant and actor, ignoring extra identifiers", async () => {
    expect(await createExpense({ ...params, business_id: "foreign", created_by_user_id: "foreign" } as never)).toEqual({ success: true });
    expect(mocks.create).toHaveBeenCalledWith({ data: { amount: 100, category: "SUPPLIES", description: "paper", date,
      business_id: "business", created_by_user_id: "actor" }, select: { id: true } });
    expect(mocks.business).toHaveBeenCalledWith({ where: { id: "business", slug: "tenant",
      owners: { some: { id: 7, business_id: "business", user_id: "actor", user: { role: "OWNER" } } } }, select: { id: true } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), {
      entityType: "Expense", entityId: "8", action: "CREATED", actorId: "actor", businessId: "business",
      changes: { after: { amount: 100, category: "SUPPLIES", description: "paper", date: date.toISOString(), mode: "EXPENSE_LOGGED" } },
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  });
  it("scopes update to verified tenant, membership and stored revision with before/after audit", async () => {
    expect(await updateExpense({ ...params, id: 8, description: " " })).toEqual({ success: true });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 8, business_id: "business", updated_at: date,
      business: expect.objectContaining({ owners: expect.anything() }) }),
      data: { amount: 100, category: "SUPPLIES", description: null, date } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "UPDATED",
      changes: { before: { amount: 50, category: "SUPPLIES", description: "old", date: date.toISOString() },
        after: { amount: 100, category: "SUPPLIES", description: null, date: date.toISOString(), mode: "EXPENSE_REVISED" } } }));
  });
  it("scopes deletion and its audit to stored revision", async () => {
    expect(await deleteExpense(8, "tenant")).toEqual({ success: true });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 8, business_id: "business", updated_at: date }) });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "CANCELLED", changes: {
      before: { amount: 50, category: "SUPPLIES", description: "old", date: date.toISOString() }, after: { mode: "EXPENSE_DELETED" } } }));
    expect(mocks.cache.mock.calls).toEqual([["/app/tenant/reports"]]);
  });
  it.each(["update", "delete"]) ("returns missing target without audit or cache: %s", async (operation) => {
    mocks.findFirst.mockResolvedValue(null);
    const result = operation === "update" ? await updateExpense({ ...params, id: 8 }) : await deleteExpense(8, "tenant");
    expect(result).toEqual({ success: false, error: "Expense not found." });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(["update", "delete"]) ("rejects a stored-revision mismatch: %s", async (operation) => {
    mocks.updateMany.mockResolvedValue({ count: 0 }); mocks.deleteMany.mockResolvedValue({ count: 0 });
    const result = operation === "update" ? await updateExpense({ ...params, id: 8 }) : await deleteExpense(8, "tenant");
    expect(result).toEqual({ success: false, error: "Expense changed. Refresh and try again." });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("rejects owner revocation during the transaction recheck", async () => {
    mocks.business.mockResolvedValue(null);
    expect(await createExpense(params)).toEqual({ success: false, error: "Forbidden" });
    expect(await updateExpense({ ...params, id: 8 })).toEqual({ success: false, error: "Forbidden" });
    expect(await deleteExpense(8, "tenant")).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(["create", "update", "delete"]) ("surfaces serialization conflict without cache: %s", async (operation) => {
    mocks.transaction.mockRejectedValue({ code: "P2034" });
    const result = operation === "create" ? await createExpense(params) : operation === "update" ? await updateExpense({ ...params, id: 8 }) : await deleteExpense(8, "tenant");
    expect(result).toEqual({ success: false, error: "Expense changed. Refresh and try again." });
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(["create", "update", "delete"]) ("does not claim success if audit fails: %s", async (operation) => {
    mocks.audit.mockRejectedValue(new Error("private SQL token"));
    const result = operation === "create" ? await createExpense(params) : operation === "update" ? await updateExpense({ ...params, id: 8 }) : await deleteExpense(8, "tenant");
    const error = operation === "create" ? "Failed to log expense." : operation === "update" ? "Failed to update expense." : "Failed to delete expense.";
    expect(result).toEqual({ success: false, error });
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(["create", "update", "delete", "list", "summary"]) ("returns safe failures when authentication throws: %s", async (operation) => {
    mocks.auth.mockRejectedValue(new Error("private session"));
    const result = operation === "create" ? await createExpense(params) : operation === "update" ? await updateExpense({ ...params, id: 8 })
      : operation === "delete" ? await deleteExpense(8, "tenant") : operation === "list" ? await getExpenses("tenant") : await getTodayExpenseSummary("tenant");
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("uses a narrow select, retained date ordering, and inclusive date bounds", async () => {
    await getExpenses("tenant", { startDate: date, endDate: date, limit: 1000 });
    expect(mocks.findMany).toHaveBeenCalledWith({ where: expect.objectContaining({ date: { gte: date, lte: date } }),
      select: { id: true, amount: true, category: true, description: true, date: true, created_at: true, created_by_user: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { created_at: "desc" }], take: 1000 });
  });
  it("maps a missing creator name to null", async () => {
    mocks.findMany.mockResolvedValue([{ ...row, created_by_user: null }]);
    expect(await getExpenses("tenant")).toEqual({ success: true, data: [expect.objectContaining({ created_by_name: null })] });
  });
  it.each(["startDate", "endDate"] as const)("supports a one-sided %s range", async (bound) => {
    await getExpenses("tenant", { [bound]: date });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      date: bound === "startDate" ? { gte: date } : { lte: date },
    }) }));
  });
  it("sums all same-day expenses independently of the five recent rows", async () => {
    vi.useFakeTimers(); vi.setSystemTime(date);
    mocks.findMany.mockResolvedValue(Array.from({ length: 5 }, () => row));
    mocks.aggregate.mockResolvedValue({ _sum: { amount: 2100 } });
    const result = await getTodayExpenseSummary("tenant");
    expect(result).toEqual({ success: true, total: 2100, recentExpenses: Array.from({ length: 5 }, () => expect.objectContaining({ amount: 100 })) });
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    expect(mocks.aggregate).toHaveBeenCalledWith({ where: expect.objectContaining({ date: { gte: start, lte: end } }), _sum: { amount: true } });
    expect(mocks.aggregate.mock.calls[0][0].where).toEqual(mocks.findMany.mock.calls[0][0].where);
    expect(mocks.aggregate.mock.calls[0][0]).not.toHaveProperty("take");
  });
  it("returns zero and an empty list on days without expenses", async () => {
    mocks.findMany.mockResolvedValue([]); mocks.aggregate.mockResolvedValue({ _sum: { amount: null } });
    expect(await getTodayExpenseSummary("tenant")).toEqual({ success: true, total: 0, recentExpenses: [] });
  });
  it.each(["list", "summary-list", "summary-total"]) ("returns safe query failures: %s", async (operation) => {
    if (operation === "summary-total") mocks.aggregate.mockRejectedValue(new Error("private query"));
    else mocks.findMany.mockRejectedValue(new Error("private query"));
    const result = operation === "list" ? await getExpenses("tenant") : await getTodayExpenseSummary("tenant");
    expect(result).toEqual({ success: false, error: operation === "list" ? "Failed to fetch expenses." : "Failed to fetch expense summary." });
  });
  it.each(["", "../tenant", "x".repeat(201)])("validates the summary slug %s", async (slug) => {
    expect(await getTodayExpenseSummary(slug)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
describe("expense action characterization", () => {
  it("creates with trimmed description and refreshes dashboard and reports", async () => {
    expect(await createExpense(params)).toEqual({ success: true });
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 100, description: "paper", date, created_by_user_id: "actor" }), select: { id: true } });
    expect(mocks.cache.mock.calls).toEqual([["/app/tenant"], ["/app/tenant/reports"]]);
  });
  it("updates with blank description cleared and refreshes reports", async () => {
    expect(await updateExpense({ ...params, id: 8, description: " " })).toEqual({ success: true });
    expect(mocks.cache.mock.calls).toEqual([["/app/tenant/reports"]]);
  });
  it("does not refresh for missing expense deletion", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await deleteExpense(8, "tenant")).toEqual({ success: false, error: "Expense not found." });
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("returns only the expense view fields", async () => {
    expect(await getExpenses("tenant", { startDate: date, endDate: date, limit: 10 })).toEqual({ success: true,
      data: [{ id: 8, amount: 100, category: "SUPPLIES", description: "paper", date, created_at: date, created_by_name: "Owner" }] });
  });
  it("keeps a five-row recent summary list", async () => {
    expect(await getTodayExpenseSummary("tenant")).toEqual({ success: true, total: 100,
      recentExpenses: [{ id: 8, amount: 100, category: "SUPPLIES", description: "paper", date, created_at: date, created_by_name: "Owner" }] });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5, orderBy: { created_at: "desc" } }));
  });
});
