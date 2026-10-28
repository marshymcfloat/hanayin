import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), entitlements: vi.fn() }));
vi.mock("@/lib/auth/owner-access", () => ({ requireOwnerPermission: mocks.access }));
vi.mock("@/features/billing/plan-entitlements", () => ({ getBusinessEntitlementsBySlug: mocks.entitlements }));
import { requireOwnerInboxAccess } from "@/features/social/customer-messaging/access";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ success: true, context: { businessId: "verified-business", businessSlug: "studio-a", userId: "owner-a" } });
  mocks.entitlements.mockResolvedValue({ social: true, ai: false });
});

describe("customer inbox access", () => {
  it("uses verified owner settings permission and independently resolves entitlements", async () => {
    expect(await requireOwnerInboxAccess("studio-a")).toMatchObject({ success: true, aiEntitled: false, context: { businessId: "verified-business" } });
    expect(mocks.access).toHaveBeenCalledWith("studio-a", "SETTINGS_MANAGE");
    expect(mocks.entitlements).toHaveBeenCalledWith("studio-a");
    expect(await requireOwnerInboxAccess("studio-a", true)).toMatchObject({ success: false, reason: "AI_REQUIRED" });
  });

  it("stops revoked or foreign owner membership before entitlement work", async () => {
    mocks.access.mockResolvedValue({ success: false, error: "Forbidden" });
    expect(await requireOwnerInboxAccess("foreign-studio")).toMatchObject({ success: false, reason: "FORBIDDEN" });
    expect(mocks.entitlements).not.toHaveBeenCalled();
  });

  it("requires Social even when AI is included", async () => {
    mocks.entitlements.mockResolvedValue({ social: false, ai: true });
    expect(await requireOwnerInboxAccess("studio-a")).toMatchObject({ success: false, reason: "SOCIAL_REQUIRED" });
  });

  it("returns only safe errors when infrastructure fails", async () => {
    mocks.entitlements.mockRejectedValue(new Error("SQL token internal"));
    const result = await requireOwnerInboxAccess("studio-a");
    expect(result).toMatchObject({ success: false, reason: "UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toMatch(/SQL|token|internal/);
  });
});
