import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOwners } from "./queries";

const mocks = vi.hoisted(() => ({ tenant: vi.fn(), actor: vi.fn(), owners: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireTenantAccess: mocks.tenant, requireAuth: vi.fn() }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { owner: { findMany: mocks.owners } } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tenant.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "owner" } } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", businessId: "biz" });
  mocks.owners.mockResolvedValue([{ id: 1, specialties: [], user: { name: "Owner", contact_number: "contact", hashed_password: "test-only-hash" } }]);
});

describe("owner directory boundary", () => {
  it.each(["Unauthorized", "Forbidden"])("denies %s before directory/membership work", async (error) => {
    mocks.tenant.mockResolvedValue({ success: false, error });
    expect(await getOwners("foreign")).toEqual([]);
    expect(mocks.tenant).toHaveBeenCalledWith("foreign");
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.owners).not.toHaveBeenCalled();
  });

  it.each([{ success: false }, { success: true, actorType: "EMPLOYEE" }])("denies missing owner membership", async (actor) => {
    mocks.actor.mockResolvedValue(actor);
    expect(await getOwners("tenant")).toEqual([]);
    expect(mocks.owners).not.toHaveBeenCalled();
  });

  it("validates input before auth work", async () => {
    expect(await getOwners("")).toEqual([]);
    expect(mocks.tenant).not.toHaveBeenCalled();
  });

  it("reads only the verified tenant and narrow user fields", async () => {
    expect(await getOwners("tenant")).toEqual([{ id: 1, specialties: [], user: { name: "Owner", contact_number: "contact" } }]);
    expect(mocks.actor).toHaveBeenCalledWith("tenant", "owner");
    expect(mocks.owners).toHaveBeenCalledWith({ where: { business_id: "biz" }, select: { id: true, specialties: true, user: { select: { name: true, contact_number: true } } } });
  });

  it("returns no internal storage error", async () => {
    mocks.owners.mockRejectedValue(new Error("private test failure"));
    expect(await getOwners("tenant")).toEqual([]);
  });
});
