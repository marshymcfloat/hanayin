import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { decimal } from "@/features/payroll/money";
import { calculateStatement } from "@/features/payroll/v2/calculation";
import { day } from "@/features/payroll/v2/period";

vi.mock("@/prisma/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/services/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/features/payroll/v2/leave-award-earnings", () => ({ matureLeaveAward: vi.fn(() => { throw new Error("Simple tracking must not calculate statutory awards"); }) }));

function fixture(input: { basis?: "DAILY" | "HOURLY" | "MONTHLY"; rate?: string; policy?: "SIMPLE" | "GOVERNMENT"; incomplete?: boolean; missing?: boolean; revision?: number; extra?: { amount: string; code: string; manual?: boolean }[]; leaveSSS?: boolean } = {}) {
  const agreement = { id: "agreement", effective_from: day("2026-09-01"), effective_to: null, basis: input.basis ?? "DAILY", rate: decimal(input.rate ?? "1000"), normal_hours: decimal(8), monthly_divisor: null, commission_rate: decimal(10), commission_basis: "ORIGINAL_PRICE" };
  const employee = { user: { name: "Test employee" }, payroll_profile: null, financial_revision: input.revision ?? 0, employment_start: day("2026-09-01"), employment_end: null, recurring_days_off: [], compensation_agreements: [agreement], schedule: [], business: { timezone: "Asia/Manila", formal_schedule_enabled: false, business_hours: [{ day_of_week: 1, is_closed: false }], special_dates: [] } };
  const attendance = input.missing || input.leaveSSS ? [] : [{ id: 1, status: "PRESENT", date: new Date("2026-09-07T00:00:00+08:00"), revision: 0, payroll_confirmed_at: input.incomplete ? null : new Date("2026-09-07T18:00:00+08:00"), payroll_confirmed_by: "owner", time_in: new Date("2026-09-07T09:00:00+08:00"), time_out: input.incomplete ? null : new Date("2026-09-07T17:00:00+08:00"), paid_in_payslip_id: null }];
  const extra = (input.extra ?? []).map((entry, index) => ({ id: "extra-" + index, source_type: entry.code === "COMMISSION" ? "SERVICE" : "ADJUSTMENT", source_id: "source-" + index, source_revision: 0, code: entry.code, description: entry.manual ? "External calculation" : entry.code, amount: decimal(entry.amount), rate: decimal(entry.amount), units: decimal(1), earned_on: day("2026-09-07"), payable_on: day("2026-09-07"), snapshot: entry.manual ? { manual: true, label: "External calculation", reason: "Amount reviewed outside ServiceFlow", actorId: "owner" } : {}, statement_id: null, reversed_at: null, taxable: Number(entry.amount) > 0, tax_category: "NORMAL" }));
  const tx = {
    payrollSettings: { findUnique: vi.fn().mockResolvedValue({ calculation_policy: "GOVERNMENT", cadence: "SEMIMONTHLY", revision: 9, rule_package: null }) },
    employee: { findFirst: vi.fn().mockResolvedValue(employee) },
    employeeAttendance: { findMany: vi.fn().mockResolvedValue(attendance) },
    workforceSession: { findMany: vi.fn().mockResolvedValue([]) },
    leaveAllocation: { findMany: vi.fn().mockResolvedValue(input.leaveSSS ? [{ id: "leave", work_date: day("2026-09-07"), paid: true, funding: "SSS", paid_in_payslip_id: null, units: decimal(1), benefit_code: "MATERNITY" }] : []) },
    payrollEarning: { findMany: vi.fn(async (query: { where: { AND?: unknown }; select?: unknown }) => query.where.AND ? extra : []) },
    payrollStatement: { findMany: vi.fn().mockResolvedValue([]) },
    payrollAdjustment: { findMany: vi.fn().mockResolvedValue([]) },
    availedService: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const run = { id: "run", start_date: day("2026-09-07"), end_date: day("2026-09-07"), payment_date: day("2026-09-15"), kind: "REGULAR", calculation_policy: input.policy ?? "SIMPLE" };
  return { tx, run, calculate: () => calculateStatement(tx as unknown as Prisma.TransactionClient, "business", 1, run, undefined, false) };
}

describe("simple payroll calculation policy", () => {
  it.each([
    ["DAILY", "1000", "1000.00"], ["HOURLY", "125", "1000.00"], ["MONTHLY", "30000", "1000.00"],
  ] as const)("calculates %s pay without government identifiers, eligibility, or rules", async (basis, rate, gross) => {
    const result = await fixture({ basis, rate }).calculate();
    expect(result.calculation).toMatchObject({ gross, net: gross, deductions: "0.00", employerCost: gross, assessments: [], issues: [] });
    expect(result.evidence).toMatchObject({ calculationPolicy: "SIMPLE", governmentCalculations: false, profile: null });
    expect(result.rulePackageId).toBeNull();
  });
  it("uses the frozen run policy even after the workspace changes", async () => {
    const setup = fixture();
    expect((await setup.calculate()).calculation.issues).toEqual([]);
    const government = await fixture({ policy: "GOVERNMENT" }).calculate();
    expect(government.calculation.issues.map(entry => entry.code)).toEqual(expect.arrayContaining(["PROFILE", "IDENTIFIERS", "RULES", "MONTHLY_BASIS", "ELIGIBILITY_HISTORY"]));
  });
  it("adds captured commissions and labelled external amounts with author and reason", async () => {
    const result = await fixture({ extra: [{ amount: "200", code: "COMMISSION" }, { amount: "50", code: "ALLOWANCE", manual: true }, { amount: "-100", code: "DEDUCTION", manual: true }] }).calculate();
    expect(result.calculation).toMatchObject({ gross: "1250.00", deductions: "100.00", net: "1150.00", assessments: [], issues: [] });
    expect(result.calculation.lines.find(line => line.code === "DEDUCTION")).toMatchObject({ category: "DEDUCTION", amount: "100.00", source: { manual: true, label: "External calculation", reason: "Amount reviewed outside ServiceFlow", actorId: "owner" } });
  });
  it("blocks incomplete clocks, missing attendance, excessive deductions, and no payable earnings", async () => {
    expect((await fixture({ incomplete: true }).calculate()).calculation.issues.map(entry => entry.code)).toContain("MISSING_CLOCK");
    expect((await fixture({ missing: true }).calculate()).calculation.issues.map(entry => entry.code)).toContain("MISSING_ATTENDANCE");
    expect((await fixture({ extra: [{ amount: "-1001", code: "DEDUCTION" }] }).calculate()).calculation.issues.map(entry => entry.code)).toContain("INSUFFICIENT_NET");
    expect((await fixture({ rate: "0" }).calculate()).calculation.issues.map(entry => entry.code)).toContain("NO_EARNINGS");
  });
  it("does not calculate an SSS leave award in simple tracking", async () => {
    expect((await fixture({ leaveSSS: true }).calculate()).calculation.gross).toBe("0.00");
  });
  it("binds review hashes to financial revisions and the calculation policy", async () => {
    expect((await fixture().calculate()).reviewHash).not.toBe((await fixture({ revision: 1 }).calculate()).reviewHash);
    expect((await fixture().calculate()).reviewHash).not.toBe((await fixture({ policy: "GOVERNMENT" }).calculate()).reviewHash);
  });
});
