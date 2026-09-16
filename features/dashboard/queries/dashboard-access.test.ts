import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  business: vi.fn(),
  employee: vi.fn(),
  owner: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/data/cached", () => ({
  getCachedBusinessBySlug: mocks.business,
  getCachedServices: vi.fn(),
  getCachedPackages: vi.fn(),
}));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    employee: { findFirst: mocks.employee },
    owner: { findFirst: mocks.owner },
  },
}));
vi.mock("@/lib/auth/staff-access", () => ({
  resolveTenantActorContext: vi.fn(),
  hasStaffPermission: vi.fn(),
}));
vi.mock("@/features/billing/plan-entitlements", () => ({
  getBusinessEntitlementsBySlug: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/data/flow-reminder-queries", () => ({
  getThisWeeksFlowRemindersCount: vi.fn(),
}));
vi.mock("@/lib/services/growth/opportunities", () => ({
  getTodayOpportunityViews: vi.fn(),
}));
vi.mock("@/features/payroll/actions/expenses", () => ({
  getTodayExpenseSummary: vi.fn(),
}));
vi.mock("@/features/payments/actions/manual-gcash", () => ({
  getGcashVerificationQueueAction: vi.fn(),
}));

import { getOwnerDashboardData } from "@/features/dashboard/queries/owner-dashboard";
import { getEmployeeDashboardData } from "@/features/dashboard/queries/employee-dashboard";

beforeEach(() => {
  vi.resetAllMocks();
});

describe.each([
  ["owner", getOwnerDashboardData],
  ["employee", getEmployeeDashboardData],
] as const)("%s dashboard access", (_role, load) => {
  it("does not read tenant data without a session", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await load({ businessSlug: "tenant" })).toBeNull();
    expect(mocks.business).not.toHaveBeenCalled();
    expect(mocks.employee).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it("stops before membership queries when the business is missing", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.business.mockResolvedValue(null);
    expect(await load({ businessSlug: "missing" })).toBeNull();
    expect(mocks.employee).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
  });

  it("requires membership in the requested business before loading dashboard metrics", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.business.mockResolvedValue({ id: "tenant-1" });
    mocks.owner.mockResolvedValue(null);
    mocks.employee.mockResolvedValue(null);
    expect(await load({ businessSlug: "tenant" })).toBeNull();
    const membership = _role === "owner" ? mocks.owner : mocks.employee;
    expect(membership).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ user_id: "user-1", business_id: "tenant-1" }),
    }));
  });
});
