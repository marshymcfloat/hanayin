import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  business: vi.fn(),
  employee: vi.fn(),
  tenant: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireTenantAccess: mocks.tenant }));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    business: { findUnique: mocks.business },
    employee: { findFirst: mocks.employee },
  },
}));

import { getAttendanceWorkspaceContext } from "./attendance";

describe("attendance workspace context", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(["Unauthorized", "Forbidden"])(
    "preserves the %s access result before persistence",
    async (error) => {
      mocks.tenant.mockResolvedValue({ success: false, error });

      await expect(getAttendanceWorkspaceContext("tenant-a")).resolves.toEqual({
        success: false,
        error,
      });
      expect(mocks.business).not.toHaveBeenCalled();
    },
  );

  it("returns a tenant-scoped employee context", async () => {
    mocks.tenant.mockResolvedValue({
      success: true,
      session: { user: { id: "user-1", role: "EMPLOYEE" } },
    });
    mocks.business.mockResolvedValue({ id: "business-1" });
    mocks.employee.mockResolvedValue({ id: 7 });

    await expect(getAttendanceWorkspaceContext("tenant-a")).resolves.toEqual({
      success: true,
      data: {
        role: "EMPLOYEE",
        businessId: "business-1",
        employeeId: 7,
      },
    });
    expect(mocks.employee).toHaveBeenCalledWith({
      where: { user_id: "user-1", business_id: "business-1" },
      select: { id: true },
    });
  });
});
