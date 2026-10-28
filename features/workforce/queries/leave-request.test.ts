import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  businessFind: vi.fn(),
  employeeFind: vi.fn(),
  leaveFindMany: vi.fn(),
  workforce: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/features/workforce/workforce-access", () => ({ currentWorkforceOwner: mocks.workforce }));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    business: { findFirst: mocks.businessFind },
    employee: { findFirst: mocks.employeeFind },
    leaveRequest: { findMany: mocks.leaveFindMany },
  },
}));

import { getLeaveRequests, getUserLeaveRequests } from "./leave-request";

describe("leave request query boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "employee-user-1", role: "EMPLOYEE" } },
    });
  });

  it("stops before persistence when unauthenticated", async () => {
    mocks.auth.mockResolvedValue({ success: false, error: "Unauthorized" });

    await expect(getUserLeaveRequests(7)).resolves.toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(mocks.employeeFind).not.toHaveBeenCalled();
  });

  it("forbids non-owners from listing all tenant leave requests", async () => {
    await expect(getLeaveRequests("business-1")).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    expect(mocks.businessFind).not.toHaveBeenCalled();
  });

  it("scopes employee history to the authenticated user and tenant", async () => {
    mocks.employeeFind.mockResolvedValue({ id: 7, business_id: "business-1" });
    mocks.leaveFindMany.mockResolvedValue([{ id: 10 }]);

    await expect(getUserLeaveRequests(7)).resolves.toEqual({
      success: true,
      data: [{ id: 10 }],
    });
    expect(mocks.employeeFind).toHaveBeenCalledWith({
      where: {
        id: 7,
        archived_at: null,
        business: { slug: "tenant-a" },
        user_id: "employee-user-1",
      },
      select: { id: true, business_id: true },
    });
    expect(mocks.leaveFindMany).toHaveBeenCalledWith({
      where: { employee_id: 7, business_id: "business-1", cancelled_at: null },
      orderBy: { created_at: "desc" },
    });
  });
  it("requires current workforce permission for an owner reading employee history", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "owner", role: "OWNER" } } });
    mocks.workforce.mockResolvedValue(null);
    expect(await getUserLeaveRequests(7)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.employeeFind).not.toHaveBeenCalled();
  });
});
