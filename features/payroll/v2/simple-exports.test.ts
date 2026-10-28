import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ count: vi.fn(), payments: vi.fn(), run: vi.fn(), settings: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/prisma/prisma", () => ({ prisma: { payrollStatement: { count: db.count }, payrollPayment: { findMany: db.payments }, payrollRun: { findFirst: db.run }, payrollSettings: { findUnique: db.settings } } }));
vi.mock("./access", () => ({ payrollOwner: async () => ({ businessId: "business", userId: "owner" }) }));
import { exportGovernmentFile, exportStatutoryRegister, exportPayrollRun } from "./exports";
import { decimal } from "@/features/payroll/money";
const identity = { businessSlug: "studio", userId: "owner" };
beforeEach(() => vi.clearAllMocks());

it("blocks official files when simple records cover the reporting month", async () => {
  db.count.mockResolvedValue(2);
  await expect(exportGovernmentFile(identity, "2026-01", "SSS")).rejects.toThrow("simple pay records");
  expect(db.settings).not.toHaveBeenCalled();
  expect(db.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ business_id: "business", run: { calculation_policy: "SIMPLE" } }) }));
});

it("includes an explicit coverage gap in the review register instead of zero assessments", async () => {
  db.count.mockResolvedValue(2); db.payments.mockResolvedValue([]);
  const result = await exportStatutoryRegister(identity, "2026-01", "BIR");
  expect(result.content).toContain("Simple pay records: 2");
  expect(result.content).toContain("Not calculated");
  expect(result.content).not.toContain("0.00");
});

it("keeps ordinary simple payroll exports available with calculation metadata", async () => {
  db.run.mockResolvedValue({ id: "run", calculation_policy: "SIMPLE", start_date: new Date("2026-01-01"), end_date: new Date("2026-01-15"), payment_date: new Date("2026-01-15"), statements: [{ id: "statement", snapshot: { employeeName: "Published name" }, employee: { user: { name: "Current name" } }, gross: decimal(100), deductions: decimal(10), net: decimal(90), employer_cost: decimal(100), paid_amount: decimal(0), payment_state: "UNPAID" }] });
  const result = await exportPayrollRun(identity, "run", "CSV");
  expect(result.content).toContain("Published name");
  expect(result.content).toContain("Not calculated automatically");
  expect(result.content).toContain("SIMPLE");
});
