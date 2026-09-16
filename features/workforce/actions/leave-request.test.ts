import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  cancel: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/features/workforce/services/leave-request", () => ({
  cancelTenantLeaveRequest: mocks.cancel,
  createTenantLeaveRequest: mocks.create,
  updateTenantLeaveRequestStatus: mocks.update,
}));

import {
  cancelLeaveRequest,
  createLeaveRequest,
  updateLeaveRequestStatus,
} from "./leave-request";

const validRequest = {
  employee_id: 7,
  business_id: "business-1",
  businessSlug: "tenant-a",
  start_date: new Date("2026-10-01T00:00:00.000Z"),
  end_date: new Date("2026-10-02T00:00:00.000Z"),
  reason: "Vacation",
  type: "VACATION" as const,
};

describe("leave request action boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "user-1", role: "EMPLOYEE" } },
    });
    mocks.create.mockResolvedValue({ success: true });
    mocks.cancel.mockResolvedValue({ success: true });
    mocks.update.mockResolvedValue({ success: true });
  });

  it("stops before validation and persistence when authentication fails", async () => {
    mocks.auth.mockResolvedValue({ success: false, error: "Unauthorized" });

    await expect(createLeaveRequest(validRequest)).resolves.toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid transport payload before invoking the service", async () => {
    const result = await createLeaveRequest({
      ...validRequest,
      employee_id: 0,
      reason: "",
    });

    expect(result.success).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns a safe validation error for a non-object payload", async () => {
    const result = await createLeaveRequest(null);

    expect(result.success).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a client tenant slug that differs from the authenticated tenant", async () => {
    const result = await createLeaveRequest({
      ...validRequest,
      businessSlug: "tenant-b",
    });

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("forbids employees from approving or rejecting leave", async () => {
    const result = await updateLeaveRequestStatus(10, "APPROVED");

    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("passes verified actor context to mutations and revalidates", async () => {
    mocks.auth.mockResolvedValue({
      success: true,
      businessSlug: "tenant-a",
      session: { user: { id: "owner-1", role: "OWNER" } },
    });

    await expect(
      updateLeaveRequestStatus(10, "REJECTED", "No coverage", false),
    ).resolves.toEqual({ success: true });
    await expect(cancelLeaveRequest(10)).resolves.toEqual({ success: true });

    expect(mocks.update).toHaveBeenCalledWith(
      10,
      "REJECTED",
      "No coverage",
      false,
      { businessSlug: "tenant-a", userId: "owner-1", role: "OWNER" },
    );
    expect(mocks.cancel).toHaveBeenCalledWith(10, {
      businessSlug: "tenant-a",
      userId: "owner-1",
      role: "OWNER",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/tenant-a/attendance");
  });
});
