import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), owner: vi.fn(), employees: vi.fn(), settings: vi.fn(), services: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireTenantAccess: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/prisma/prisma", () => ({ prisma: { owner: { findFirst: mocks.owner }, employee: { findMany: mocks.employees }, payrollSettings: { findUnique: mocks.settings }, service: { findMany: mocks.services } } }));
import { getEmployeesWorkspaceData } from "./employees";
const base = { id: 1, business_id: "business-a", user_id: "employee-a", user: { id: "employee-a", name: "Ana", contact_number: "639123456789", role: "EMPLOYEE", created_at: new Date(), updated_at: new Date() }, attendance: [], _count: { served_services: 0 } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ success: true, session: { user: { id: "owner-a", role: "OWNER" } } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", businessId: "business-a", businessSlug: "studio", userId: "owner-a", ownerId: 7 });
  mocks.owner.mockResolvedValue({ permissions: ["EMPLOYEES_MANAGE"] });
  mocks.settings.mockResolvedValue({ mode: "LEGACY" });
  mocks.employees.mockResolvedValue([base]);
  mocks.services.mockResolvedValue([{ category: "Hair" }]);
});
describe("People workspace payroll visibility", () => {
  it("denies missing current employee-management capability before reading records", async () => {
    mocks.owner.mockResolvedValue(null);
    expect(await getEmployeesWorkspaceData("studio")).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.employees).not.toHaveBeenCalled();
  });
  it("never selects compensation or payslips for an owner without payroll capability", async () => {
    const result = await getEmployeesWorkspaceData("studio");
    expect(result).toMatchObject({ success: true, canAccessPayroll: false, canManageCompensation: false, employees: [{ salary: null, daily_rate: null, commission_percentage: null, payslips: [] }] });
    expect(mocks.employees).toHaveBeenCalledTimes(1);
    const request = mocks.employees.mock.calls[0][0];
    expect(request.where).toMatchObject({ business_id: "business-a", archived_at: null });
    expect(request.select).not.toHaveProperty("salary");
    expect(request.select).not.toHaveProperty("payslips");
    expect(request.select.user.select).not.toHaveProperty("hashed_password");
  });
  it("suppresses the legacy rate editor and legacy balances after activation", async () => {
    mocks.owner.mockResolvedValue({ permissions: ["EMPLOYEES_MANAGE", "PAYROLL_MANAGE"] });
    mocks.settings.mockResolvedValue({ mode: "ACTIVE" });
    expect(await getEmployeesWorkspaceData("studio")).toMatchObject({ success: true, canAccessPayroll: true, canManageCompensation: false, employees: [{ salary: null, daily_rate: null, commission_percentage: null }] });
    expect(mocks.employees).toHaveBeenCalledTimes(1);
  });
  it("allows legacy compensation only with both capabilities, scoped in the financial query", async () => {
    mocks.owner.mockResolvedValue({ permissions: ["EMPLOYEES_MANAGE", "PAYROLL_MANAGE"] });
    mocks.employees.mockResolvedValueOnce([base]).mockResolvedValueOnce([{ id: 1, salary: 500, daily_rate: 100, commission_percentage: 10, payslips: [] }]);
    expect(await getEmployeesWorkspaceData("studio")).toMatchObject({ success: true, canManageCompensation: true, employees: [{ salary: 500, daily_rate: 100, commission_percentage: 10 }] });
    expect(mocks.employees.mock.calls[1][0].where.business.owners.some.permissions).toEqual({ hasEvery: ["EMPLOYEES_MANAGE", "PAYROLL_MANAGE"] });
  });
  it("discards the response if payroll permission is revoked during the read", async () => {
    mocks.owner.mockResolvedValueOnce({ permissions: ["EMPLOYEES_MANAGE", "PAYROLL_MANAGE"] }).mockResolvedValueOnce({ permissions: ["EMPLOYEES_MANAGE"] });
    expect(await getEmployeesWorkspaceData("studio")).toEqual({ success: false, error: "Forbidden" });
  });
  it("discards the response if the payroll writer changes while it is read", async () => {
    mocks.settings.mockResolvedValueOnce({ mode: "LEGACY" }).mockResolvedValueOnce({ mode: "ACTIVE" });
    expect(await getEmployeesWorkspaceData("studio")).toEqual({ success: false, error: "Forbidden" });
  });
});
