import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  business: { findFirst: vi.fn() },
  owner: { findFirst: vi.fn() },
  employee: { findMany: vi.fn() },
  payslip: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/prisma/prisma", () => ({ prisma: db }));

import { getOwnerPayrollPreviewData } from "./owner-payroll-preview";

const actor = {
  success: true as const, actorType: "OWNER" as const, ownerId: 7,
  businessId: "business-a", businessSlug: "studio-a", userId: "owner-a",
  role: "OWNER", businessPolicy: {}, profile: null, permissions: [], employeeId: null,
};

describe("owner payroll preview read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.business.findFirst.mockResolvedValue({ name: "Studio A" });
    db.owner.findFirst.mockResolvedValue({ id: 7 });
    db.employee.findMany.mockResolvedValue([{ id: 1, profile: "STAFF", daily_rate: 1000, commission_percentage: 12, user: { name: "Ana" }, payslips: [{ total_salary: 4800, released_at: new Date("2026-09-20T00:00:00Z"), ending_date: new Date("2026-09-20T00:00:00Z") }] }]);
    db.payslip.aggregate.mockResolvedValue({ _sum: { total_salary: 4800 } });
    db.payslip.count.mockResolvedValue(1);
    db.payslip.findMany.mockResolvedValue([{ id: 12, starting_date: new Date("2026-09-01T00:00:00Z"), ending_date: new Date("2026-09-20T00:00:00Z"), released_at: new Date("2026-09-20T00:00:00Z"), total_salary: 4800, employee: { user: { name: "Ana" } } }]);
  });

  it("rejects revoked membership before checking permission or reading compensation", async () => {
    db.business.findFirst.mockResolvedValue(null);
    expect(await getOwnerPayrollPreviewData(actor as never, db as never)).toBeNull();
    expect(db.owner.findFirst).not.toHaveBeenCalled();
    expect(db.employee.findMany).not.toHaveBeenCalled();
    expect(db.payslip.findMany).not.toHaveBeenCalled();
  });

  it("returns only a redacted restricted state without any compensation queries", async () => {
    db.owner.findFirst.mockResolvedValue(null);
    expect(await getOwnerPayrollPreviewData(actor as never, db as never)).toEqual({ access: "restricted" });
    expect(db.owner.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 7, business_id: "business-a", user_id: "owner-a", permissions: { has: "PAYROLL_MANAGE" } }), select: { id: true } });
    expect(db.employee.findMany).not.toHaveBeenCalled();
    expect(db.payslip.aggregate).not.toHaveBeenCalled();
    expect(db.payslip.count).not.toHaveBeenCalled();
    expect(db.payslip.findMany).not.toHaveBeenCalled();
  });

  it("returns narrow paid records and repeats tenant and capability checks in compensation queries", async () => {
    const result = await getOwnerPayrollPreviewData(actor as never, db as never, new Date("2026-09-27T17:00:00Z"));
    expect(result).toMatchObject({ access: "granted", month: "2026-09", paidThisMonth: 4800, paidPayslipsThisMonth: 1, employees: [{ name: "Ana", dailyRate: 1000, commissionPercentage: 12, lastPaidAmount: 4800 }], recentPayslips: [{ employeeName: "Ana", amount: 4800 }] });
    const employeeWhere = expect.objectContaining({ business_id: "business-a", business: expect.objectContaining({ slug: "studio-a", owners: { some: expect.objectContaining({ permissions: { has: "PAYROLL_MANAGE" } }) } }) });
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: employeeWhere, select: expect.objectContaining({ user: { select: { name: true } } }) }));
    expect(db.payslip.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "PAID", employee: employeeWhere }, take: 20 }));
    expect(db.payslip.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: [expect.objectContaining({ employee: employeeWhere }), expect.anything()] }) }));
    expect(JSON.stringify(result)).not.toContain("business-a");
  });

  it("does not treat a legacy period end as a confirmed payment date", async () => {
    db.employee.findMany.mockResolvedValueOnce([{ id: 1, profile: "STAFF", daily_rate: 1000, commission_percentage: 12, user: { name: "Ana" }, payslips: [{ total_salary: 4800, released_at: null, ending_date: new Date("2026-09-20T00:00:00Z") }] }]);
    db.payslip.aggregate.mockResolvedValueOnce({ _sum: { total_salary: null } });
    db.payslip.count.mockResolvedValueOnce(0);
    db.payslip.findMany.mockResolvedValueOnce([{ id: 12, starting_date: new Date("2026-09-01T00:00:00Z"), ending_date: new Date("2026-09-20T00:00:00Z"), released_at: null, total_salary: 4800, employee: { user: { name: "Ana" } } }]);

    const result = await getOwnerPayrollPreviewData(actor as never, db as never, new Date("2026-09-27T00:00:00Z"));
    expect(result).toMatchObject({ access: "granted", paidThisMonth: 0, paidPayslipsThisMonth: 0, employees: [{ lastPaidAt: null, lastPaidAmount: 4800 }], recentPayslips: [{ paidAt: null, amount: 4800 }] });
    expect(db.payslip.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: [expect.anything(), { released_at: { gte: new Date("2026-08-31T16:00:00Z"), lt: new Date("2026-09-30T16:00:00Z") } }] }) }));
  });
});
