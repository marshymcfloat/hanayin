import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  business: { findFirst: vi.fn() },
  employee: { findMany: vi.fn() },
  employeeAttendance: { findMany: vi.fn() },
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({
  unstable_cache:
    (callback: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      callback(...args),
}));

import {
  getDailyAttendanceForTenant,
  getEmployeeAttendanceHistoryForTenant,
} from "./attendance-admin";

describe("attendance admin queries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects a caller-provided business id outside the authenticated tenant", async () => {
    prismaMock.business.findFirst.mockResolvedValue(null);

    await expect(
      getDailyAttendanceForTenant(
        "tenant-a",
        "biz-b",
        new Date("2026-09-16T00:00:00.000Z"),
      ),
    ).resolves.toBeNull();
    expect(prismaMock.business.findFirst).toHaveBeenCalledWith({
      where: { id: "biz-b", slug: "tenant-a" },
      select: { id: true },
    });
    expect(prismaMock.employee.findMany).not.toHaveBeenCalled();
  });

  it("scopes attendance history through the employee tenant relation", async () => {
    prismaMock.employeeAttendance.findMany.mockResolvedValue([]);

    await getEmployeeAttendanceHistoryForTenant("tenant-a", 42);

    expect(prismaMock.employeeAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employee_id: 42,
          employee: { business: { slug: "tenant-a" } },
        },
        take: 90,
      }),
    );
  });
});
