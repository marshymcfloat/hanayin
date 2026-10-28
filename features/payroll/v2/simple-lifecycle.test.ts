import { beforeEach, describe, expect, it, vi } from "vitest";
import { decimal } from "@/features/payroll/money";
import { saveSimplePayslip, recordPayment } from "@/features/payroll/v2/lifecycle";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), calculate: vi.fn(), candidate: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/features/payroll/v2/calculation", () => ({ calculateStatement: mocks.calculate }));
vi.mock("@/features/payroll/v2/payment-reconciliation", () => ({ paymentDateCandidate: mocks.candidate }));
vi.mock("@/lib/services/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const identity = { businessSlug: "business", userId: "owner" };
const input = { key: "00000000-0000-4000-8000-000000000001", expectedRevision: 1, statementId: "00000000-0000-4000-8000-000000000002" };
function fixture() {
  const initial = { id: input.statementId, employee_id: 1, revision: 1, status: "DRAFT", payment_state: "UNPAID", legacy_payslip_id: null, review_hash: "reviewed", net: decimal(100), paid_amount: decimal(0), run: { calculation_policy: "SIMPLE", payment_date: new Date("2026-09-15T00:00:00Z") }, employee: { user_id: "employee", business_id: "business" }, lines: [{ id: "line", category: "EARNING", amount: decimal(100) }] };
  let statement = { ...initial };
  let payments: { id: string; amount: ReturnType<typeof decimal>; allocations: { line_id: string; amount: ReturnType<typeof decimal> }[] }[] = [];
  let notifications = 0;
  let commands = new Map<string, Record<string, unknown>>();
  const tx = {
    owner: { findFirst: vi.fn().mockResolvedValue({ id: "owner", business_id: "business" }) },
    payrollSettings: { findUnique: vi.fn().mockResolvedValue({ mode: "ACTIVE", calculation_policy: "SIMPLE", sms_enabled: false }) },
    payrollCommand: {
      findUnique: vi.fn(async (query: { where: { business_id_key: { key: string } } }) => commands.get(query.where.business_id_key.key) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { commands.set(String(data.key), data); return data; }),
    },
    payrollStatement: {
      findFirst: vi.fn(async (query: { where: { status?: string } }) => query.where.status === "APPROVED" ? null : { ...statement, payments }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const { revision, ...values } = data; statement = { ...statement, ...values, revision: statement.revision + ((revision as { increment?: number } | undefined)?.increment ?? 0) }; return statement; }),
    },
    payrollEarning: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    payrollNotification: { create: vi.fn(async () => { notifications++; return {}; }) },
    payrollPayment: { create: vi.fn(async ({ data }: { data: { amount: ReturnType<typeof decimal> } }) => { const payment = { id: "payment-" + payments.length, amount: data.amount, allocations: [] }; payments.push(payment); return payment; }) },
    payrollPaymentAllocation: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  mocks.transaction.mockImplementation(async (work: (db: typeof tx) => Promise<unknown>) => {
    const previous = { statement: { ...statement }, payments: [...payments], notifications, commands: new Map(commands) };
    try { return await work(tx); }
    catch (error) { statement = previous.statement; payments = previous.payments; notifications = previous.notifications; commands = previous.commands; throw error; }
  });
  mocks.calculate.mockResolvedValue({ reviewHash: "reviewed", calculation: { issues: [] }, earningIds: ["earning"] });
  return { tx, get statement() { return statement; }, get payments() { return payments; }, get notifications() { return notifications; }, get commandCount() { return commands.size; } };
}

beforeEach(() => vi.clearAllMocks());
describe("simple reviewed-save orchestration", () => {
  it("approves and publishes a reviewed draft with an unpaid state", async () => {
    const state = fixture();
    expect(await saveSimplePayslip(identity, input)).toMatchObject({ success: true, id: input.statementId, revision: 3 });
    expect(state.statement).toMatchObject({ status: "PUBLISHED", payment_state: "UNPAID" });
    expect(state.statement.paid_amount.toFixed(2)).toBe("0.00");
    expect(state.payments).toHaveLength(0);
    expect(state.notifications).toBe(1);
  });
  it("records an optional partial actual payment in the same command and permits safe replay", async () => {
    const state = fixture();
    const command = { ...input, payment: { amount: "40.00", date: "2026-10-01", method: "CASH" as const, reference: "Cash handed over" } };
    const result = await saveSimplePayslip(identity, command);
    expect(result).toMatchObject({ success: true, revision: 4 });
    expect(state.statement).toMatchObject({ status: "PUBLISHED", payment_state: "PARTIAL" });
    expect(state.statement.paid_amount.toFixed(2)).toBe("40.00");
    expect(await saveSimplePayslip(identity, command)).toEqual(result);
    expect(state.payments).toHaveLength(1);
    expect(state.notifications).toBe(1);
    expect(mocks.candidate).not.toHaveBeenCalled();
    expect(state.commandCount).toBe(1);
  });
  it("rolls back the reviewed-save command if the optional payment exceeds the balance", async () => {
    const state = fixture();
    expect(await saveSimplePayslip(identity, { ...input, payment: { amount: "100.01", date: "2026-09-15", method: "CASH", reference: "Invalid payment" } })).toMatchObject({ success: false, code: "INVALID_INPUT" });
    expect(state.statement).toMatchObject({ status: "DRAFT", revision: 1, payment_state: "UNPAID" });
    expect(state.payments).toHaveLength(0);
    expect(state.notifications).toBe(0);
    expect(state.commandCount).toBe(0);
  });
  it("rejects future payment dates and stale reviews before committing a payslip", async () => {
    const state = fixture();
    expect(await saveSimplePayslip(identity, { ...input, payment: { amount: "100.00", date: "2099-01-01", method: "CASH", reference: "Future payment" } })).toMatchObject({ success: false, code: "INVALID_INPUT" });
    mocks.calculate.mockResolvedValueOnce({ reviewHash: "changed", calculation: { issues: [] }, earningIds: ["earning"] });
    expect(await saveSimplePayslip(identity, input)).toMatchObject({ success: false, code: "STALE_REVIEW" });
    expect(state.statement.status).toBe("DRAFT");
  });
  it("preserves government payment reconciliation when the frozen run is government", async () => {
    const state = fixture();
    await state.tx.payrollStatement.update({ data: { status: "PUBLISHED", run: { calculation_policy: "GOVERNMENT", payment_date: new Date("2026-09-15T00:00:00Z") } } });
    mocks.candidate.mockRejectedValueOnce(new Error("Government reconciliation still runs"));
    expect(await recordPayment(identity, { ...input, amount: "100.00", date: "2026-10-01", method: "CASH", reference: "Government payment" })).toMatchObject({ success: false });
    expect(mocks.candidate).toHaveBeenCalledOnce();
    expect(state.payments).toHaveLength(0);
  });
});
