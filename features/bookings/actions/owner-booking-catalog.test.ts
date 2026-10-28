import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  actor: vi.fn(),
  catalog: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/features/auth/auth-options", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/features/bookings/queries/owner-booking-catalog", () => ({ readOwnerBookingCatalog: mocks.catalog }));

import { getOwnerBookingCatalog } from "./owner-booking-catalog";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner-a", role: "OWNER", businessSlug: "beautyfeel" } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", businessId: "business-a" });
  mocks.catalog.mockResolvedValue({ services: [], packages: [], categories: [] });
});

describe("owner quick booking catalog", () => {
  it("reads only the verified owner's tenant", async () => {
    expect(await getOwnerBookingCatalog("beautyfeel")).toEqual({
      success: true,
      data: { services: [], packages: [], categories: [] },
    });
    expect(mocks.actor).toHaveBeenCalledWith("beautyfeel", "owner-a");
    expect(mocks.catalog).toHaveBeenCalledWith("business-a");
  });

  it.each([
    ["unauthenticated", null],
    ["staff", { user: { id: "staff-a", role: "EMPLOYEE", businessSlug: "beautyfeel" } }],
    ["another tenant", { user: { id: "owner-a", role: "OWNER", businessSlug: "other" } }],
  ])("rejects %s before tenant reads", async (_label, session) => {
    mocks.session.mockResolvedValue(session);
    expect(await getOwnerBookingCatalog("beautyfeel")).toEqual({ success: false, denied: true });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it("rejects a revoked owner membership", async () => {
    mocks.actor.mockResolvedValue({ success: false, error: "Forbidden" });
    expect(await getOwnerBookingCatalog("beautyfeel")).toEqual({ success: false, denied: true });
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it("does not expose catalog failures", async () => {
    mocks.catalog.mockRejectedValue(new Error("internal database details"));
    expect(await getOwnerBookingCatalog("beautyfeel")).toEqual({ success: false, denied: false });
  });
});
