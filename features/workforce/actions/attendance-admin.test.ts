import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.hoisted(() => vi.fn());
const getDailyAttendanceForTenantMock = vi.hoisted(() => vi.fn());
const getEmployeeAttendanceHistoryForTenantMock = vi.hoisted(() => vi.fn());
const previewTenantAttendanceImpactMock = vi.hoisted(() => vi.fn());
const updateTenantAttendanceStatusMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const updateTagMock = vi.hoisted(() => vi.fn());
const workforceOwnerMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/workforce/workforce-access", () => ({ currentWorkforceOwner: workforceOwnerMock }));

vi.mock("@/lib/auth/guards", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/features/workforce/queries/attendance-admin", () => ({
  getDailyAttendanceForTenant: getDailyAttendanceForTenantMock,
  getEmployeeAttendanceHistoryForTenant:
    getEmployeeAttendanceHistoryForTenantMock,
}));
vi.mock("@/features/workforce/services/attendance-admin", () => ({
  previewTenantAttendanceImpact: previewTenantAttendanceImpactMock,
  updateTenantAttendanceStatus: updateTenantAttendanceStatusMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock, updateTag: updateTagMock }));

import {
  getDailyAttendance,
  previewAttendanceImpactAction,
  updateAttendanceStatus,
} from "./attendance-admin";

describe("attendance admin action boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    workforceOwnerMock.mockResolvedValue({ id: 1, business_id: "biz-a" });
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "owner-a", role: "OWNER" } },
    });
  });

  it("stops unauthenticated reads before querying attendance", async () => {
    requireAuthMock.mockResolvedValue({
      success: false,
      error: "Unauthorized",
    });

    await expect(getDailyAttendance("biz-a", new Date())).resolves.toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(getDailyAttendanceForTenantMock).not.toHaveBeenCalled();
  });

  it("rejects non-owner attendance administration", async () => {
    requireAuthMock.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { role: "EMPLOYEE" } },
    });

    await expect(
      updateAttendanceStatus(7, new Date(), "ABSENT"),
    ).resolves.toEqual({ success: false, error: "Forbidden" });
    expect(updateTenantAttendanceStatusMock).not.toHaveBeenCalled();
  });

  it("validates untrusted action input before invoking the service", async () => {
    await expect(
      previewAttendanceImpactAction(-1, new Date("invalid")),
    ).resolves.toEqual({
      success: false,
      error: "Invalid attendance request",
    });
    expect(previewTenantAttendanceImpactMock).not.toHaveBeenCalled();
  });

  it("passes only the authenticated tenant slug to feature queries", async () => {
    const date = new Date("2026-09-16T00:00:00.000Z");
    getDailyAttendanceForTenantMock.mockResolvedValue([]);

    await expect(getDailyAttendance("biz-a", date)).resolves.toEqual({
      success: true,
      data: [],
    });
    expect(getDailyAttendanceForTenantMock).toHaveBeenCalledWith(
      "tenant-a",
      "biz-a",
      date,
    );
  });

  it("revalidates only after a successful status update", async () => {
    updateTenantAttendanceStatusMock.mockResolvedValue({
      success: false,
      error: "Unauthorized",
    });

    await updateAttendanceStatus(7, new Date(), "ABSENT");
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(updateTagMock).not.toHaveBeenCalled();

    updateTenantAttendanceStatusMock.mockResolvedValue({ success: true });
    await updateAttendanceStatus(7, new Date(), "PRESENT");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(updateTagMock).toHaveBeenCalledWith("attendance-history-tenant-a");
  });
});
