import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import {
  createPayslipAction,
  getEmployeePayslipAuditAction,
  getPayslipDataAction,
  getPayslipHistoryAction,
} from "./payslip";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  actor: vi.fn(),
  owner: { findFirst: vi.fn() },
  payrollSettings: { findUnique: vi.fn() },
  leaveAllocation: { findMany: vi.fn(), updateMany: vi.fn() },
  employee: { findUnique: vi.fn(), findFirst: vi.fn() },
  attendance: { findMany: vi.fn(), updateMany: vi.fn() },
  services: { findMany: vi.fn(), updateMany: vi.fn() },
  payslip: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  audit: { findMany: vi.fn() },
  transaction: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/date-utils", () => ({
  getCurrentDateTimePH: () => new Date("2026-09-16T10:00:00Z"),
  getStartOfDayPH: () => new Date("2026-09-01T00:00:00Z"),
}));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    owner: mocks.owner,
    leaveAllocation: mocks.leaveAllocation,
    employee: mocks.employee,
    employeeAttendance: mocks.attendance,
    availedService: mocks.services,
    payslip: mocks.payslip,
    auditLog: mocks.audit,
    $transaction: mocks.transaction,
  },
}));

const employee = {
  id: 7,
  business_id: "biz_1",
  daily_rate: 100,
  commission_percentage: 10,
  business: { slug: "shop" },
  user: { name: "Employee", created_at: new Date("2026-09-01T00:00:00Z") },
};
const attendance = [
  { id: 1, status: "PRESENT", date: new Date("2026-09-10"), is_paid_leave: false },
  { id: 2, status: "LEAVE", date: new Date("2026-09-11"), is_paid_leave: true },
];
const services = [
  { id: 1, commission_base: 200, price: 500 },
  { id: 2, commission_base: null, price: 100 },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    success: true,
    businessSlug: "shop",
    session: { user: { id: "owner_1", role: "OWNER" } },
  });
  mocks.actor.mockResolvedValue({
    success: true, actorType: "OWNER", ownerId: 4,
    businessId: "biz_1", businessSlug: "shop", userId: "owner_1",
  });
  mocks.owner.findFirst.mockResolvedValue({ id: 4 });
  mocks.employee.findUnique.mockResolvedValue(employee);
  mocks.employee.findFirst.mockResolvedValue(employee);
  mocks.attendance.findMany.mockResolvedValue(attendance);
  mocks.services.findMany.mockResolvedValue(services);
  mocks.attendance.updateMany.mockResolvedValue({ count: 2 });
  mocks.services.updateMany.mockResolvedValue({ count: 2 });
  mocks.payslip.findFirst.mockResolvedValue(null);
  mocks.leaveAllocation.findMany.mockResolvedValue([]);
  mocks.leaveAllocation.updateMany.mockResolvedValue({ count: 0 });
  mocks.payslip.create.mockResolvedValue({ id: 123 });
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      owner: mocks.owner,
      leaveAllocation: mocks.leaveAllocation,
      payrollSettings: mocks.payrollSettings,
      employee: mocks.employee,
      employeeAttendance: mocks.attendance,
      availedService: mocks.services,
      payslip: mocks.payslip,
    }),
  );
});

describe("payslip action characterization", () => {
  it("calculates paid attendance and commission-base fallback", async () => {
    const result = await getPayslipDataAction(7);
    expect(result).toMatchObject({
      success: true,
      data: {
        breakdown: { days_present: 1, paid_leave_days: 1, basic_salary: 200, commission_total: 30 },
        total_salary: 230,
      },
    });
    expect(mocks.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ paid_in_payslip_id: null }) }),
    );
  });

  it("caps deductions and commits audit and payment stamps together", async () => {
    const result = await createPayslipAction({ employeeId: 7, deduction: 999 });
    expect(result).toMatchObject({ success: true, data: { breakdown: { deduction: 230, net_salary: 0 } } });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ businessId: "biz_1" }));
    expect(mocks.attendance.updateMany).toHaveBeenCalled();
    expect(mocks.services.updateMany).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/app/shop/payroll");
  });

  it("denies non-owner creation before writes", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "shop", session: { user: { id: "staff", role: "EMPLOYEE" } } });
    expect(await createPayslipAction({ employeeId: 7 })).toMatchObject({ success: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("denies owners without current payroll permission before compensation reads or writes", async () => {
    mocks.owner.findFirst.mockResolvedValue(null);
    expect(await getPayslipDataAction(7)).toEqual({ success: false, error: "Forbidden" });
    expect(await getPayslipHistoryAction(7)).toEqual({ success: false, error: "Forbidden" });
    expect(await getEmployeePayslipAuditAction(7)).toEqual({ success: false, error: "Forbidden" });
    expect(await createPayslipAction({ employeeId: 7 })).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.owner.findFirst).toHaveBeenCalledWith({
      where: {
        id: 4, business_id: "biz_1", user_id: "owner_1",
        user: { role: "OWNER" }, permissions: { has: "PAYROLL_MANAGE" },
      },
      select: { id: true },
    });
    expect(mocks.employee.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.payslip.findMany).not.toHaveBeenCalled();
  });

  it("denies stale or cross-tenant owner membership", async () => {
    mocks.actor.mockResolvedValue({ success: false, error: "Forbidden" });
    expect(await getPayslipDataAction(7)).toEqual({ success: false, error: "Forbidden" });
    expect(await createPayslipAction({ employeeId: 7 })).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.owner.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid input before employee reads", async () => {
    expect(await createPayslipAction({ employeeId: -1 })).toMatchObject({ success: false });
    expect(await getPayslipDataAction(1.5)).toMatchObject({ success: false });
    expect(await createPayslipAction({ employeeId: 7, comment: "x".repeat(2001) })).toMatchObject({ success: false });
    expect(mocks.employee.findFirst).not.toHaveBeenCalled();
  });

  it("uses serializable transactions and tenant-scoped conditional stamps", async () => {
    await createPayslipAction({ employeeId: 7 });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mocks.attendance.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employee_id: 7, employee: { business: { slug: "shop" } }, paid_in_payslip_id: null }) }));
    expect(mocks.services.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ served_by_id: 7, booking: { business: { slug: "shop" } }, paid_in_payslip_id: null }) }));
  });

  it("keeps preview and release consistent and stamps duplicate attendance rows", async () => {
    mocks.attendance.findMany.mockResolvedValue([...attendance, { ...attendance[0], id: 3 }]);
    mocks.attendance.updateMany.mockResolvedValue({ count: 3 });
    expect(await getPayslipDataAction(7)).toMatchObject({ data: { total_salary: 230 } });
    expect(await createPayslipAction({ employeeId: 7 })).toMatchObject({ success: true, data: { breakdown: { gross_salary: 230 } } });
    expect(mocks.attendance.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [1, 2, 3] } }) }));
  });

  it.each(["attendance", "services"] as const)("rejects incomplete %s stamps without cache invalidation", async (delegate) => {
    mocks[delegate].updateMany.mockResolvedValue({ count: 1 });
    expect(await createPayslipAction({ employeeId: 7 })).toEqual({ success: false, error: "Payroll records changed. Refresh and try again." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns safe serialization conflicts without invalidation", async () => {
    mocks.transaction.mockRejectedValue({ code: "P2034" });
    expect(await createPayslipAction({ employeeId: 7 })).toEqual({ success: false, error: "Payroll records changed. Refresh and try again." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("denies cross-tenant creation", async () => {
    mocks.employee.findUnique.mockResolvedValue({ ...employee, business: { slug: "other" } });
    mocks.employee.findFirst.mockResolvedValue(null);
    expect(await createPayslipAction({ employeeId: 7 })).toMatchObject({ success: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns safe duplicate-period errors without invalidation", async () => {
    mocks.transaction.mockRejectedValue({ code: "P2002" });
    expect(await createPayslipAction({ employeeId: 7 })).toEqual({ success: false, error: "A payslip for this period already exists. Refresh and try again." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("denies another employee's history", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "shop", session: { user: { id: "staff", role: "EMPLOYEE" } } });
    mocks.employee.findUnique.mockResolvedValue({ ...employee, id: 8 });
    mocks.employee.findFirst.mockResolvedValue({ ...employee, id: 8 });
    expect(await getPayslipHistoryAction(7)).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.payslip.findMany).not.toHaveBeenCalled();
  });

  it("returns ordered history", async () => {
    mocks.payslip.findMany.mockResolvedValue([{ id: 123 }]);
    expect(await getPayslipHistoryAction(7)).toEqual({ success: true, data: [{ id: 123 }] });
    expect(mocks.payslip.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { ending_date: "desc" } }));
  });

  it("scopes and serializes payslip audit rows", async () => {
    mocks.employee.findFirst.mockResolvedValue({ ...employee, payslips: [{ id: 123 }] });
    mocks.audit.findMany.mockResolvedValue([{ id: "audit_1", entity_id: "123", action: "CREATED", actor_id: "owner_1", changes: null, created_at: new Date("2026-09-16T10:00:00Z") }]);
    expect(await getEmployeePayslipAuditAction(7)).toMatchObject({ success: true, data: [{ payslipId: "123", createdAt: "2026-09-16T10:00:00.000Z" }] });
    expect(mocks.audit.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ business_id: "biz_1" }), take: 100 }));
  });

  it("denies unauthenticated requests before persistence", async () => {
    mocks.auth.mockResolvedValue({ success: false, error: "Unauthorized" });
    expect(await getPayslipDataAction(7)).toEqual({ success: false, error: "Unauthorized" });
    expect(await createPayslipAction({ employeeId: 7 })).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.employee.findFirst).not.toHaveBeenCalled();
  });

  it("denies a manager's team salary access and permits only their own audit", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "shop", session: { user: { id: "staff", role: "EMPLOYEE" } } });
    mocks.employee.findFirst.mockResolvedValueOnce({ id: 8, profile: "MANAGER" });
    expect(await getEmployeePayslipAuditAction(7)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.employee.findFirst).toHaveBeenNthCalledWith(1, { where: { user_id: "staff", business: { slug: "shop" } }, select: { id: true, profile: true } });
    mocks.employee.findFirst.mockReset().mockResolvedValueOnce({ id: 7, profile: "STAFF" }).mockResolvedValueOnce({ ...employee, payslips: [] });
    expect(await getEmployeePayslipAuditAction(7)).toEqual({ success: true, data: [] });
    mocks.employee.findFirst.mockResolvedValue(null);
    expect(await getEmployeePayslipAuditAction(7)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.audit.findMany).not.toHaveBeenCalled();
  });
});
