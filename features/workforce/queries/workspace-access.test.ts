import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tenant: vi.fn(), permission: vi.fn(), actor: vi.fn(), business: vi.fn(), cachedBusiness: vi.fn(),
  employees: vi.fn(), owners: vi.fn(), services: vi.fn(), packages: vi.fn(), groupBy: vi.fn(),
  giftCards: vi.fn(), ownerMembership: vi.fn(), payrollSettings: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireTenantAccess: mocks.tenant }));
vi.mock("@/lib/auth/staff-access", () => ({ requireStaffPermission: mocks.permission, resolveTenantActorContext: mocks.actor }));
vi.mock("@/lib/data/cached", () => ({ getCachedBusinessBySlug: mocks.cachedBusiness }));
vi.mock("@/features/gift-cards/actions/gift-cards", () => ({ getGiftCardsAction: mocks.giftCards }));
vi.mock("@/prisma/prisma", () => ({ prisma: {
  business: { findUnique: mocks.business }, employee: { findMany: mocks.employees },
  owner: { findMany: mocks.owners, findFirst: mocks.ownerMembership }, payrollSettings: { findUnique: mocks.payrollSettings }, service: { findMany: mocks.services, groupBy: mocks.groupBy },
  servicePackage: { findMany: mocks.packages },
} }));

import { getEmployeesWorkspaceData } from "@/features/workforce/queries/employees";
import { getGiftCardsWorkspaceData } from "@/features/gift-cards/queries/workspace";
import { getOwnersWorkspaceData } from "@/features/businesses/queries/owners";
import { getPackagesWorkspaceData } from "@/features/catalog/queries/packages";
import { publicUserSelect, toPublicUser } from "@/lib/auth/public-user";
import { getPayrollWorkspaceData } from "@/features/payroll/queries/workspace";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", businessId: "biz", ownerId: 7, userId: "owner", role: "OWNER" });
  mocks.ownerMembership.mockResolvedValue({ id: 7, permissions: ["EMPLOYEES_MANAGE", "PAYROLL_MANAGE"] });
  mocks.payrollSettings.mockResolvedValue(null);
});

describe.each([
  ["employees", getEmployeesWorkspaceData],
  ["gift cards", getGiftCardsWorkspaceData],
  ["owners", getOwnersWorkspaceData],
] as const)("%s workspace query", (_name, load) => {
  it("stops before persistence when tenant access is denied", async () => {
    mocks.tenant.mockResolvedValue({ success: false, error: "Forbidden" });
    expect(await load("other")).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.business).not.toHaveBeenCalled();
  });
});

it("stops package queries when catalog permission is denied", async () => {
  mocks.permission.mockResolvedValue({ success: false, error: "Forbidden" });
  expect(await getPackagesWorkspaceData("tenant")).toEqual({ success: false, error: "Forbidden" });
  expect(mocks.cachedBusiness).not.toHaveBeenCalled();
  expect(mocks.packages).not.toHaveBeenCalled();
});

it("requires the owner role before employee or owner-list persistence", async () => {
  mocks.tenant.mockResolvedValue({ success: true, session: { user: { role: "EMPLOYEE" } } });
  expect(await getEmployeesWorkspaceData("tenant")).toEqual({ success: false, error: "Forbidden" });
  expect(await getOwnersWorkspaceData("tenant")).toEqual({ success: false, error: "Forbidden" });
  expect(mocks.business).not.toHaveBeenCalled();
});

it("normalizes and sorts employee service categories", async () => {
  mocks.tenant.mockResolvedValue({ success: true, session: { user: { id: "owner", role: "OWNER" } } });
  mocks.business.mockResolvedValue({ id: "tenant-1" });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", businessId: "tenant-1", ownerId: 7, userId: "owner", role: "OWNER" });
  mocks.employees.mockResolvedValue([]);
  mocks.services.mockResolvedValue([{ category: "Nails" }, { category: "general" }, { category: "Hair" }]);
  const result = await getEmployeesWorkspaceData("tenant");
  expect(result).toMatchObject({ success: true, categories: ["Hair", "Nails"] });
  expect(mocks.ownerMembership).toHaveBeenCalledWith({ where: { id: 7, business_id: "tenant-1", user_id: "owner", user: { role: "OWNER" }, permissions: { has: "EMPLOYEES_MANAGE" } }, select: { permissions: true } });
  expect(mocks.employees).toHaveBeenCalledWith(expect.objectContaining({ where: {
    business_id: "tenant-1", archived_at: null, user: { role: "EMPLOYEE" },
    business: { owners: { some: { id: 7, business_id: "tenant-1", user_id: "owner", user: { role: "OWNER" }, permissions: { has: "EMPLOYEES_MANAGE" } } } },
  } }));
});

it.each([
  ["employees", getEmployeesWorkspaceData, mocks.employees],
  ["owners", getOwnersWorkspaceData, mocks.owners],
] as const)("never returns credential fields from %s workspace", async (field, load, query) => {
  const user = { id: "u", name: "Member", contact_number: "contact", role: field === "employees" ? "EMPLOYEE" as const : "OWNER" as const, created_at: new Date(), updated_at: new Date(), hashed_password: "test-only-hash", must_change_password: true, temp_password_expires_at: new Date() };
  mocks.tenant.mockResolvedValue({ success: true, session: { user: { id: "owner", role: "OWNER" } } });
  mocks.business.mockResolvedValue({ id: "biz" });
  mocks.services.mockResolvedValue([]);
  query.mockResolvedValue([{ id: 1, user }]);
  const result = await load("tenant");
  expect(result).toMatchObject({ success: true, [field]: [{ id: 1, user: toPublicUser(user) }] });
  expect(JSON.stringify(result)).not.toContain("hashed_password");
  expect(JSON.stringify(result)).not.toContain("must_change_password");
  expect(JSON.stringify(result)).not.toContain("temp_password_expires_at");
  if (field === "employees") {
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ user: { select: publicUserSelect } }) }));
    const directoryProjection = query.mock.calls[0][0].select;
    expect(directoryProjection).not.toHaveProperty("salary");
    expect(directoryProjection).not.toHaveProperty("daily_rate");
    expect(directoryProjection).not.toHaveProperty("commission_percentage");
  } else expect(query).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ user: { select: publicUserSelect } }) }));
});

it("never returns credentials from payroll employee lists", async () => {
  const user = { id: "u", name: "Member", contact_number: "contact", role: "EMPLOYEE" as const, created_at: new Date(), updated_at: new Date(), hashed_password: "test-only-hash", must_change_password: true, temp_password_expires_at: new Date() };
  mocks.tenant.mockResolvedValue({ success: true, session: { user: { id: "owner", role: "OWNER" } } });
  mocks.cachedBusiness.mockResolvedValue({ id: "biz" });
  mocks.employees.mockResolvedValue([{ id: 1, user }]);
  const result = await getPayrollWorkspaceData("tenant");
  expect(result).toMatchObject({ success: true, employees: [{ id: 1, user: toPublicUser(user) }] });
  expect(JSON.stringify(result)).not.toContain("hashed_password");
  expect(JSON.stringify(result)).not.toContain("must_change_password");
  expect(JSON.stringify(result)).not.toContain("temp_password_expires_at");
  expect(mocks.employees).toHaveBeenCalledWith(expect.objectContaining({ where: { business_id: "biz" }, include: expect.objectContaining({ user: { select: publicUserSelect } }) }));
  expect(mocks.ownerMembership).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 7, user_id: "owner", business_id: "biz", user: { role: "OWNER" }, permissions: { has: "PAYROLL_MANAGE" } }) }));
});

it.each([getOwnersWorkspaceData, getEmployeesWorkspaceData, getPayrollWorkspaceData])("denies removed/foreign owner membership before live directory reads", async (load) => {
  mocks.tenant.mockResolvedValue({ success: true, session: { user: { id: "owner", role: "OWNER" } } });
  mocks.actor.mockResolvedValue({ success: false, error: "Unauthorized" });
  expect(await load("tenant")).toEqual({ success: false, error: "Forbidden" });
  expect(mocks.actor).toHaveBeenCalledWith("tenant", "owner");
  expect(mocks.owners).not.toHaveBeenCalled();
  expect(mocks.employees).not.toHaveBeenCalled();
  expect(mocks.services).not.toHaveBeenCalled();
});
