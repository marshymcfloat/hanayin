import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantActorContext } from "@/lib/auth/staff-access";

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@/prisma/prisma", () => ({
  prisma: { employee: { findFirst } },
}));

import { getEmployeeDashboardMembership } from "./employee-membership";

const context = {
  success: true,
  actorType: "EMPLOYEE",
  employeeId: 101,
  businessId: "biz-1",
  userId: "user-1",
} as Extract<TenantActorContext, { success: true; actorType: "EMPLOYEE" }>;

describe("employee dashboard membership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses verified membership identifiers and selects only dashboard fields", async () => {
    const employee = { id: 101, specialties: ["Nails"] };
    findFirst.mockResolvedValue(employee);

    expect(await getEmployeeDashboardMembership(context)).toEqual(employee);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 101, business_id: "biz-1", user_id: "user-1" },
      select: { id: true, specialties: true },
    });
  });

  it("returns null for removed or moved membership", async () => {
    findFirst.mockResolvedValue(null);

    expect(await getEmployeeDashboardMembership(context)).toBeNull();
  });
});
