import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTenantAccess: vi.fn(),
  resolveActor: vi.fn(),
  ownerFindFirst: vi.fn(),
  employeeFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireTenantAccess: mocks.requireTenantAccess }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.resolveActor }));
vi.mock("@/prisma/prisma", () => ({
  prisma: { owner: { findFirst: mocks.ownerFindFirst }, employee: { findMany: mocks.employeeFindMany } },
}));

import { getPayrollWorkspaceData } from "./workspace";

describe("payroll workspace access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireTenantAccess.mockResolvedValue({
      success: true,
      session: { user: { id: "owner-a", role: "OWNER" } },
    });
    mocks.resolveActor.mockResolvedValue({
      success: true, actorType: "OWNER", ownerId: 7,
      businessId: "business-a", businessSlug: "studio-a", userId: "owner-a",
    });
  });

  it("denies a revoked payroll owner before reading compensation", async () => {
    mocks.ownerFindFirst.mockResolvedValue(null);
    await expect(getPayrollWorkspaceData("studio-a")).resolves.toEqual({ success: false, error: "Forbidden" });
    expect(mocks.employeeFindMany).not.toHaveBeenCalled();
  });

  it("scopes employee compensation to the verified owner business", async () => {
    mocks.ownerFindFirst.mockResolvedValue({ id: 7 });
    mocks.employeeFindMany.mockResolvedValue([]);
    await expect(getPayrollWorkspaceData("studio-a")).resolves.toMatchObject({ success: true, employees: [] });
    expect(mocks.ownerFindFirst).toHaveBeenCalledWith({
      where: {
        id: 7, business_id: "business-a", user_id: "owner-a",
        user: { role: "OWNER" }, permissions: { has: "PAYROLL_MANAGE" },
      },
      select: { id: true },
    });
    expect(mocks.employeeFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { business_id: "business-a" } }));
  });
});
