import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  resolveTenantActorContext: vi.fn(),
  findEntityAuditPage: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: mocks.requireAuth,
}));
vi.mock("@/lib/auth/staff-access", () => ({
  resolveTenantActorContext: mocks.resolveTenantActorContext,
}));
vi.mock("@/features/platform/audit/repository", () => ({
  findEntityAuditPage: mocks.findEntityAuditPage,
}));

import { getEntityAuditHistoryAction } from "@/features/platform/audit/actions";

describe("getEntityAuditHistoryAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("denies a platform admin before tenant resolution or persistence", async () => {
    mocks.requireAuth.mockResolvedValue({
      success: true,
      businessSlug: "platform",
      session: { user: { id: "admin-1", role: "PLATFORM_ADMIN" } },
    });

    await expect(
      getEntityAuditHistoryAction("Booking", "booking-1"),
    ).resolves.toEqual({ success: false, error: "Forbidden" });
    expect(mocks.resolveTenantActorContext).not.toHaveBeenCalled();
    expect(mocks.findEntityAuditPage).not.toHaveBeenCalled();
  });

  it("passes verified tenant filters and a clamped page size to persistence", async () => {
    mocks.requireAuth.mockResolvedValue({
      success: true,
      businessSlug: "salon-a",
      session: { user: { id: "user-1" } },
    });
    mocks.resolveTenantActorContext.mockResolvedValue({
      success: true,
      actorType: "OWNER",
      profile: null,
      businessId: "business-1",
    });
    mocks.findEntityAuditPage.mockResolvedValue([]);

    await expect(
      getEntityAuditHistoryAction("Booking", "booking-1", 999),
    ).resolves.toEqual({ success: true, entries: [] });
    expect(mocks.findEntityAuditPage).toHaveBeenCalledWith({
      businessId: "business-1",
      entityType: "Booking",
      entityId: "booking-1",
      limit: 200,
    });
  });

  it("denies staff before persistence", async () => {
    mocks.requireAuth.mockResolvedValue({
      success: true,
      businessSlug: "salon-a",
      session: { user: { id: "user-1" } },
    });
    mocks.resolveTenantActorContext.mockResolvedValue({
      success: true,
      actorType: "EMPLOYEE",
      profile: "STAFF",
      businessId: "business-1",
    });

    await expect(
      getEntityAuditHistoryAction("Booking", "booking-1"),
    ).resolves.toEqual({ success: false, error: "Forbidden" });
    expect(mocks.findEntityAuditPage).not.toHaveBeenCalled();
  });
});
