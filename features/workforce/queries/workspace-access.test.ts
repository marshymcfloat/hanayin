import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tenant: vi.fn(), permission: vi.fn(), business: vi.fn(), cachedBusiness: vi.fn(),
  employees: vi.fn(), owners: vi.fn(), services: vi.fn(), packages: vi.fn(), groupBy: vi.fn(),
  giftCards: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireTenantAccess: mocks.tenant }));
vi.mock("@/lib/auth/staff-access", () => ({ requireStaffPermission: mocks.permission }));
vi.mock("@/lib/data/cached", () => ({ getCachedBusinessBySlug: mocks.cachedBusiness }));
vi.mock("@/features/gift-cards/actions/gift-cards", () => ({ getGiftCardsAction: mocks.giftCards }));
vi.mock("@/prisma/prisma", () => ({ prisma: {
  business: { findUnique: mocks.business }, employee: { findMany: mocks.employees },
  owner: { findMany: mocks.owners }, service: { findMany: mocks.services, groupBy: mocks.groupBy },
  servicePackage: { findMany: mocks.packages },
} }));

import { getEmployeesWorkspaceData } from "@/features/workforce/queries/employees";
import { getGiftCardsWorkspaceData } from "@/features/gift-cards/queries/workspace";
import { getOwnersWorkspaceData } from "@/features/businesses/queries/owners";
import { getPackagesWorkspaceData } from "@/features/catalog/queries/packages";

beforeEach(() => { vi.resetAllMocks(); });

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
  mocks.tenant.mockResolvedValue({ success: true, session: { user: { role: "OWNER" } } });
  mocks.business.mockResolvedValue({ id: "tenant-1" });
  mocks.employees.mockResolvedValue([]);
  mocks.services.mockResolvedValue([{ category: "Nails" }, { category: "general" }, { category: "Hair" }]);
  const result = await getEmployeesWorkspaceData("tenant");
  expect(result).toMatchObject({ success: true, categories: ["Hair", "Nails"] });
  expect(mocks.employees).toHaveBeenCalledWith(expect.objectContaining({ where: { business_id: "tenant-1" } }));
});
