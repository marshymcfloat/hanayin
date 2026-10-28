import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), actor: vi.fn(), services: vi.fn(), packages: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/lib/data/cached", () => ({ getCachedServices: mocks.services, getCachedPackages: mocks.packages }));
vi.mock("@/components/dashboard/owner-preview/OwnerBookingsPreview", () => ({ OwnerBookingsPreviewRoute: () => null }));
vi.mock("@/components/dashboard/owner-preview/OwnerPreviewBookingCreateButton", () => ({ OwnerPreviewBookingCreateButton: () => null }));

import { OwnerBookingCreateAction } from "./OwnerBookingCreateAction";
import { OwnerBookingsWorkspace } from "@/components/dashboard/owner-preview/OwnerBookingsWorkspace";

const params = Promise.resolve({ businessSlug: "beautyfeel" });

describe("owner preview booking form loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner-a", role: "OWNER", businessSlug: "beautyfeel" } });
    mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", businessId: "business-a" });
    mocks.services.mockResolvedValue([{ id: 1, name: "Brow Shape", category: "Brows", price: 450, duration: 30 }]);
    mocks.packages.mockResolvedValue([]);
  });

  it("denies catalog reads for a foreign or revoked owner", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "owner-a", role: "OWNER", businessSlug: "other" } });
    expect(await OwnerBookingCreateAction({ params })).toBeNull();
    mocks.actor.mockResolvedValueOnce({ success: false });
    expect(await OwnerBookingCreateAction({ params })).toBeNull();
    expect(mocks.services).not.toHaveBeenCalled();
    expect(mocks.packages).not.toHaveBeenCalled();
  });

  it("loads only the verified business catalog for the booking form", async () => {
    const result = await OwnerBookingCreateAction({ params });
    expect(mocks.actor).toHaveBeenCalledWith("beautyfeel", "owner-a");
    expect(mocks.services).toHaveBeenCalledWith("business-a");
    expect(mocks.packages).toHaveBeenCalledWith("business-a");
    expect(result?.props).toMatchObject({ businessSlug: "beautyfeel", categories: ["Brows"] });
  });

  it("passes the verified service catalog to booking management", async () => {
    const result = await OwnerBookingsWorkspace({ params });
    expect(result?.props.servicesCatalog).toEqual([{ id: 1, name: "Brow Shape", category: "Brows", price: 450, duration: 30 }]);
    expect(result?.props.bookingAction.props.businessSlug).toBe("beautyfeel");
    expect(mocks.services).toHaveBeenCalledWith("business-a");
  });
});
