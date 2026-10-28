// Colocated action regression test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  business: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  employee: {
    findFirst: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  user: { findUnique: vi.fn(), create: vi.fn() },
  owner: { findFirst: vi.fn() },
  payrollSettings: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
const inviteMock = vi.hoisted(() => vi.fn());
const actorMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/staff-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/staff-access")>();
  return { ...actual, resolveTenantActorContext: actorMock };
});
vi.mock("@/lib/services/employee-invite", () => ({ sendEmployeeInviteSms: inviteMock }));
vi.mock("bcryptjs", () => ({ hash: vi.fn().mockResolvedValue("test-only-hash") }));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/prisma/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createEmployeeAction, deleteEmployeeAction } from "./employees";
import { publicUserSelect, toPublicUser } from "@/lib/auth/public-user";
import { revalidatePath } from "next/cache";

describe("employee server actions tenant boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: {
        user: {
          id: "owner",
          role: "OWNER",
        },
      },
    });
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_a" });
    actorMock.mockResolvedValue({ success: true, actorType: "OWNER", role: "OWNER", businessId: "biz_a", businessSlug: "tenant-a", userId: "owner", ownerId: 1, employeeId: null, profile: null, permissions: ["EMPLOYEES_MANAGE", "PAYROLL_MANAGE"] });
    prismaMock.$transaction.mockImplementation(async callback => callback(prismaMock));
  });

  it("rejects deleting employees outside tenant scope", async () => {
    prismaMock.employee.findFirst.mockResolvedValue(null);

    const result = await deleteEmployeeAction(99);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: "Employee not found",
      }),
    );
    expect(prismaMock.employee.delete).not.toHaveBeenCalled();
  });
});

describe("employee creation safe responses", () => {
  const user = { id: "staff", name: "Staff", contact_number: "639171234567", role: "EMPLOYEE" as const, created_at: new Date("2026-09-16"), updated_at: new Date("2026-09-16"), hashed_password: "test-only-hash", must_change_password: true, temp_password_expires_at: new Date() };
  const input = { name: "Staff", contact_number: "09171234567", daily_rate: 100, commission_percentage: 10 };

  beforeEach(() => {
    vi.resetAllMocks();
    requireAuthMock.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "owner", role: "OWNER" } } });
    prismaMock.business.findUnique.mockResolvedValue({ id: "biz_a", name: "Tenant" });
    prismaMock.business.findFirst.mockResolvedValue({ id: "biz_a", name: "Tenant" });
    actorMock.mockResolvedValue({ success: true, actorType: "OWNER", role: "OWNER", businessId: "biz_a", businessSlug: "tenant-a", userId: "owner", ownerId: 1, employeeId: null, profile: null, permissions: ["EMPLOYEES_MANAGE", "PAYROLL_MANAGE"] });
    prismaMock.owner.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.payrollSettings.findUnique.mockResolvedValue({ mode: "LEGACY" });
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "staff" });
    prismaMock.employee.create.mockResolvedValue({ id: 7, business_id: "biz_a", user });
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    inviteMock.mockResolvedValue({ success: true });
  });

  it.each([true, false])("returns no credentials when SMS success is %s", async (success) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    inviteMock.mockResolvedValue({ success, error: "test provider failure" });
    const result = await createEmployeeAction(input);
    expect(result).toMatchObject({ success: true, data: { id: 7, user: toPublicUser(user) } });
    if (!success) expect(result).toHaveProperty("warning", "Employee created but SMS failed to send.");
    expect(JSON.stringify(result)).not.toContain("hashed_password");
    expect(JSON.stringify(result)).not.toContain("must_change_password");
    expect(JSON.stringify(result)).not.toContain("temp_password_expires_at");
    expect(prismaMock.employee.create).toHaveBeenCalledWith(expect.objectContaining({ include: { user: { select: publicUserSelect } }, data: expect.objectContaining({ business_id: "biz_a" }) }));
    expect(prismaMock.owner.findFirst).toHaveBeenCalledWith({ where: { id: 1, user_id: "owner", business_id: "biz_a", permissions: { has: "PAYROLL_MANAGE" } }, select: { id: true } });
    expect(prismaMock.payrollSettings.findUnique).toHaveBeenCalledWith({ where: { business_id: "biz_a" }, select: { mode: true } });
    expect(revalidatePath).toHaveBeenCalledWith("/app/tenant-a/employees");
    errorSpy.mockRestore();
  });

  it("denies non-owner creation before writes", async () => {
    requireAuthMock.mockResolvedValue({ success: true, session: { user: { role: "EMPLOYEE" } } });
    expect(await createEmployeeAction(input)).toEqual({ success: false, error: "Forbidden" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it("requires current payroll permission before persisting nonzero legacy compensation", async () => {
    prismaMock.owner.findFirst.mockResolvedValue(null);
    expect(await createEmployeeAction(input)).toEqual({ success: false, error: "Payroll permission is required to set compensation." });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.employee.create).not.toHaveBeenCalled();
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it.each(["SHADOW", "ACTIVE"])("blocks legacy compensation creation in %s mode", async mode => {
    prismaMock.payrollSettings.findUnique.mockResolvedValue({ mode });
    expect(await createEmployeeAction(input)).toEqual({ success: false, error: "Create the employee with zero legacy rates, then add an effective compensation agreement in Payroll setup." });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.employee.create).not.toHaveBeenCalled();
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it("denies unauthenticated creation before database work", async () => {
    requireAuthMock.mockResolvedValue({ success: false, error: "Unauthorized" });
    expect(await createEmployeeAction(input)).toEqual({ success: false, error: "Unauthorized" });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("denies stale/foreign owner membership before account persistence", async () => {
    actorMock.mockResolvedValue({ success: false });
    expect(await createEmployeeAction(input)).toEqual({ success: false, error: "Forbidden" });
    expect(actorMock).toHaveBeenCalledWith("tenant-a", "owner", prismaMock);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(inviteMock).not.toHaveBeenCalled();
  });

  it.each([{ name: "" }, { daily_rate: -1 }, { commission_percentage: Number.NaN }])("rejects malformed employee input before database work", async (invalid) => {
    expect(await createEmployeeAction({ ...input, ...invalid })).toEqual({ success: false, error: "Invalid employee input" });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
