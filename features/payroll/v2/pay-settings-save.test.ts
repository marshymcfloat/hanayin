import { beforeEach, expect, it, vi } from "vitest";
import { decimal } from "@/features/payroll/money";
const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/services/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
import { saveCompensation } from "@/features/payroll/v2/setup";
import { compensationSchema } from "@/features/payroll/v2/schemas";
const input = { key: "00000000-0000-4000-8000-000000000001", employeeId: 1, expectedRevision: 2, employmentStart: "2026-01-01", from: "2026-11-01", basis: "DAILY" as const, rate: "600", hours: "8", commissionRate: "10", commissionBasis: "ORIGINAL_PRICE" as const };
let tx: ReturnType<typeof fixture>;
function fixture() { return { owner: { findFirst: vi.fn().mockResolvedValue({ id: 1, business_id: "business" }) }, employee: { findFirst: vi.fn().mockResolvedValue({ id: 1, financial_revision: 2, employment_start: null as Date | null, employment_end: null as Date | null }), update: vi.fn() }, payrollSettings: { findUnique: vi.fn().mockResolvedValue({ calculation_policy: "SIMPLE" }) }, payrollEarning: { findFirst: vi.fn().mockResolvedValue(null) }, compensationAgreement: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "new" }), update: vi.fn() }, payrollCommand: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() } }; }
beforeEach(() => { tx = fixture(); mocks.transaction.mockImplementation((work: (db: typeof tx) => unknown) => work(tx)); });
it("blocks changes over published work even when no prior open agreement was found", async () => {
  tx.payrollEarning.findFirst.mockResolvedValue({ id: "published" });
  expect(await saveCompensation({ businessSlug: "studio", userId: "owner" }, input)).toMatchObject({ success: false, code: "BLOCKED" });
  expect(tx.compensationAgreement.create).not.toHaveBeenCalled();
  expect(tx.employee.update).not.toHaveBeenCalled();
});
it("rejects a date that would overlap a scheduled agreement", async () => {
  tx.compensationAgreement.findFirst.mockResolvedValueOnce({ id: "scheduled" });
  expect(await saveCompensation({ businessSlug: "studio", userId: "owner" }, input)).toMatchObject({ success: false, code: "CONFLICT" });
  expect(tx.compensationAgreement.create).not.toHaveBeenCalled();
});
it("closes the preceding date range and appends a new rate without editing legacy rates or payslips", async () => {
  tx.compensationAgreement.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "previous" });
  expect(await saveCompensation({ businessSlug: "studio", userId: "owner" }, input)).toMatchObject({ success: true, id: "new" });
  expect(tx.compensationAgreement.update).toHaveBeenCalledWith({ where: { id: "previous" }, data: { effective_to: new Date("2026-10-31T00:00:00Z") } });
  expect(tx.compensationAgreement.create.mock.calls[0][0].data.rate).toEqual(decimal("600"));
  expect(tx.employee.update).not.toHaveBeenCalled();
});
it("accepts pay-only input and strips employment dates from older clients", () => {
  const parsed = compensationSchema.parse({ ...input, employmentStart: "1990-01-01", employmentEnd: "2099-01-01" });
  expect(parsed).not.toHaveProperty("employmentStart");
  expect(parsed).not.toHaveProperty("employmentEnd");
  expect(compensationSchema.safeParse({ ...parsed, from: "2026-12-01" }).success).toBe(true);
});
it("validates the pay date against persisted employment dates, not submitted dates", async () => {
  tx.employee.findFirst.mockResolvedValue({ id: 1, financial_revision: 2, employment_start: new Date("2026-12-01"), employment_end: null });
  expect(await saveCompensation({ businessSlug: "studio", userId: "owner" }, input)).toMatchObject({ success: false, code: "INVALID_INPUT" });
  expect(tx.compensationAgreement.create).not.toHaveBeenCalled();
  expect(tx.employee.update).not.toHaveBeenCalled();
});
it("does not invent an employment date when it is unknown", async () => {
  expect(await saveCompensation({ businessSlug: "studio", userId: "owner" }, input)).toMatchObject({ success: true });
  expect(tx.employee.update).not.toHaveBeenCalled();
});
