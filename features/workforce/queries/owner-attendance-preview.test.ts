import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  business: { findFirst: vi.fn() },
  employee: { findMany: vi.fn() },
  leaveRequest: { findMany: vi.fn(), count: vi.fn() },
}));
vi.mock("@/prisma/prisma", () => ({ prisma: db }));

import { getOwnerAttendancePreviewData } from "./owner-attendance-preview";

const actor = {
  success: true as const, actorType: "OWNER" as const, ownerId: 7,
  businessId: "business-a", businessSlug: "studio-a", userId: "owner-a",
  role: "OWNER", businessPolicy: {}, profile: null, permissions: ["WORKFORCE_MANAGE"], employeeId: null,
};

describe("owner attendance preview read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.business.findFirst.mockResolvedValue({ name: "Studio A" });
    db.employee.findMany.mockResolvedValue([
      { id: 1, profile: "STAFF", user: { name: "Ana" }, attendance: [], leave_allocations: [] },
      { id: 2, profile: "MANAGER", user: { name: "Bea" }, attendance: [{ status: "PRESENT", time_in: new Date("2026-09-27T01:00:00Z"), time_out: null }], leave_allocations: [] },
    ]);
    db.leaveRequest.findMany.mockResolvedValue([]);
    db.leaveRequest.count.mockResolvedValue(2);
  });

  it("verifies current owner membership before querying employee or leave data", async () => {
    db.business.findFirst.mockResolvedValue(null);
    expect(await getOwnerAttendancePreviewData(actor as never, "2026-09-27")).toBeNull();
    expect(db.employee.findMany).not.toHaveBeenCalled();
    expect(db.leaveRequest.findMany).not.toHaveBeenCalled();
    expect(db.business.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "business-a", slug: "studio-a", owners: { some: { id: 7, user_id: "owner-a", business_id: "business-a", user: { role: "OWNER" }, permissions: { has: "WORKFORCE_MANAGE" } } } }) }));
  });

  it("uses tenant and Philippine-local day predicates, bounded leave data, and narrow DTOs", async () => {
    const result = await getOwnerAttendancePreviewData(actor as never, "2026-09-27");
    expect(result).toMatchObject({
      businessName: "Studio A", date: "2026-09-27", pendingLeaveCount: 2,
      employees: [{ name: "Ana", status: "UNRECORDED", timeIn: null }, { name: "Bea", status: "PRESENT", timeIn: "2026-09-27T01:00:00.000Z" }],
    });
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { business_id: "business-a", user: { role: "EMPLOYEE" }, archived_at: null },
      select: expect.objectContaining({ user: { select: { name: true } }, leave_allocations: { where: { work_date: new Date("2026-09-27T00:00:00Z"), cancelled_at: null }, select: { id: true }, take: 1 }, attendance: expect.objectContaining({ where: { date: { gte: new Date("2026-09-26T16:00:00Z"), lte: new Date("2026-09-27T15:59:59.999Z") } } }) }),
    }));
    expect(db.leaveRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { business_id: "business-a", employee: { business_id: "business-a" }, cancelled_at: null }, take: 20 }));
    expect(db.leaveRequest.count).toHaveBeenCalledWith({ where: { business_id: "business-a", employee: { business_id: "business-a" }, status: "PENDING", cancelled_at: null } });
    expect(JSON.stringify(result)).not.toContain("business-a");
  });
});
