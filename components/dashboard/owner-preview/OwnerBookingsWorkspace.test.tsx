import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerBookingsWorkspace } from "@/components/dashboard/owner-preview/OwnerBookingsWorkspace";

const mocks = vi.hoisted(() => ({ session: vi.fn(), actor: vi.fn(), services: vi.fn(), packages: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/lib/data/cached", () => ({ getCachedServices: mocks.services, getCachedPackages: mocks.packages }));
vi.mock("@/components/dashboard/owner-preview/OwnerBookingsPreview", () => ({ OwnerBookingsPreviewRoute: () => null }));
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewBookingCreateButton", () => ({ OwnerPreviewBookingCreateButton: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner-a", role: "OWNER", businessSlug: "studio" } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", businessId: "verified-business" });
  mocks.services.mockResolvedValue([{ id: 7, name: "Cut", category: "Hair", price: 200, duration: 30, privateField: "excluded" }]);
});

describe("redesign booking workspace access", () => {
  it("derives the tenant from the owner session and passes only real service fields", async () => {
    const result = await OwnerBookingsWorkspace({ redesign: true, fontClassName: "font" });
    expect(mocks.actor).toHaveBeenCalledWith("studio", "owner-a");
    expect(mocks.services).toHaveBeenCalledWith("verified-business");
    expect(mocks.packages).not.toHaveBeenCalled();
    expect(result?.props).toEqual({ redesign: true, fontClassName: "font", servicesCatalog: [{ id: 7, name: "Cut", category: "Hair", price: 200, duration: 30 }] });
  });

  it("does not read the catalog for a mismatched legacy slug", async () => {
    expect(await OwnerBookingsWorkspace({ params: Promise.resolve({ businessSlug: "another-tenant" }) })).toBeNull();
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.services).not.toHaveBeenCalled();
  });

  it("does not read the catalog when current membership is denied", async () => {
    mocks.actor.mockResolvedValue({ success: false });
    expect(await OwnerBookingsWorkspace({ redesign: true })).toBeNull();
    expect(mocks.services).not.toHaveBeenCalled();
  });
});
