import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPrimaryOwnerAction, updateOwnerPermissionsAction } from "./owners";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), read: vi.fn(), primaries: vi.fn(), update: vi.fn(), updateMany: vi.fn(), audit: vi.fn(), transaction: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/prisma/prisma", () => ({ prisma: { owner: { findFirst: mocks.read, update: mocks.update }, $transaction: mocks.transaction } }));

const caller = { id: 5, permissions: ["SETTINGS_MANAGE"], is_primary: true, business_id: "fixture-business" };
const target = { id: 99, permissions: ["SETTINGS_MANAGE"], is_primary: false, business_id: "fixture-business" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "fixture-slug", session: { user: { id: "fixture-user", role: "OWNER" } } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", ownerId: 5, businessId: "fixture-business", businessSlug: "fixture-slug", userId: "fixture-user" });
  mocks.read.mockImplementation(async input => input.where.id === 99 ? target : caller);
  mocks.primaries.mockResolvedValue([{ id: 5 }]);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async callback => callback({ owner: { findFirst: mocks.read, findMany: mocks.primaries, update: mocks.update, updateMany: mocks.updateMany }, auditLog: { create: mocks.audit } }));
});

describe("owner administration compatibility", () => {
  it("filters unknown permissions, deduplicates and removes redundant sales-only reporting", async () => {
    expect(await updateOwnerPermissionsAction(99, ["UNKNOWN", "REPORTS_VIEW_SALES_ONLY", "REPORTS_VIEW_FULL", "REPORTS_VIEW_FULL", "SETTINGS_MANAGE"])).toEqual({ success: true });
    expect(mocks.updateMany.mock.calls[0][0].data.permissions).toEqual(["REPORTS_VIEW_FULL", "SETTINGS_MANAGE"]);
    expect(mocks.cache).toHaveBeenCalledWith("/app/fixture-slug/owners");
  });

  it("requires at least one valid permission", async () => {
    expect(await updateOwnerPermissionsAction(99, ["UNKNOWN"])).toEqual({ success: false, error: "An owner must have at least one permission." });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("protects the primary owner's settings permission", async () => {
    mocks.read.mockImplementation(async input => input.where.id === 99 ? { ...target, is_primary: true } : caller);
    expect(await updateOwnerPermissionsAction(99, ["REPORTS_VIEW_FULL"])).toEqual({ success: false, error: "The primary owner must keep SETTINGS_MANAGE." });
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("retains already-primary success without cache invalidation", async () => {
    mocks.read.mockImplementation(async input => input.where.id === 99 ? { ...target, is_primary: true } : caller);
    expect(await setPrimaryOwnerAction(99)).toEqual({ success: true });
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("clears previous primaries and promotes the target before cache invalidation", async () => {
    expect(await setPrimaryOwnerAction(99)).toEqual({ success: true });
    expect(mocks.updateMany).toHaveBeenNthCalledWith(1, { where: { business_id: "fixture-business", is_primary: true }, data: { is_primary: false } });
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, { where: { id: 99, business_id: "fixture-business", user: { role: "OWNER" }, is_primary: false, permissions: { equals: ["SETTINGS_MANAGE"] } }, data: { is_primary: true } });
    expect(mocks.updateMany.mock.invocationCallOrder[1]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 2147483648, "99", null, undefined])("rejects invalid owner ID %s in both entry points before authorization", async id => {
    expect(await updateOwnerPermissionsAction(id as number, ["SETTINGS_MANAGE"])).toEqual({ success: false, error: "Invalid input" });
    expect(await setPrimaryOwnerAction(id as number)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([null, undefined, {}, "SETTINGS_MANAGE", [1], ["x".repeat(101)], Array.from({ length: 101 }, () => "SETTINGS_MANAGE")])("rejects malformed/oversized permission arrays %j before authorization", async permissions => {
    expect(await updateOwnerPermissionsAction(99, permissions)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["Unauthorized", "Forbidden", "Subscription is read only"])("retains %s denials without writes/cache", async error => {
    mocks.auth.mockResolvedValue({ success: false, error });
    expect(await updateOwnerPermissionsAction(99, ["SETTINGS_MANAGE"])).toEqual({ success: false, error });
    expect(await setPrimaryOwnerAction(99)).toEqual({ success: false, error });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each(["EMPLOYEE", "PLATFORM_ADMIN"])("denies current %s roles", async role => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "fixture-slug", session: { user: { id: "fixture-user", role } } });
    expect(await setPrimaryOwnerAction(99)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("denies stale tenant owner contexts and missing current settings capability", async () => {
    mocks.actor.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect(await setPrimaryOwnerAction(99)).toEqual({ success: false, error: "Forbidden" });
    mocks.read.mockResolvedValueOnce(null);
    expect(await setPrimaryOwnerAction(99)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["permissions", "primary"])("rechecks the actor capability inside the %s transaction", async mode => {
    mocks.read.mockResolvedValueOnce(caller).mockResolvedValueOnce(null);
    const result = mode === "permissions" ? await updateOwnerPermissionsAction(99, ["REPORTS_VIEW_FULL"]) : await setPrimaryOwnerAction(99);
    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.read.mock.calls[1][0]).toEqual({ where: { id: 5, business_id: "fixture-business", user_id: "fixture-user", user: { role: "OWNER" }, permissions: { has: "SETTINGS_MANAGE" } }, select: { id: true } });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each(["permissions", "primary"])("denies a foreign or missing %s target without writes", async mode => {
    mocks.read.mockImplementation(async input => input.where.id === 99 ? null : caller);
    const result = mode === "permissions" ? await updateOwnerPermissionsAction(99, ["REPORTS_VIEW_FULL"]) : await setPrimaryOwnerAction(99);
    expect(result).toEqual({ success: false, error: "Owner not found" });
    expect(mocks.read.mock.calls[2][0].where).toEqual({ id: 99, business_id: "fixture-business", user: { role: "OWNER" } });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("compares tenant, current target role, exact stored permissions and primary state before permission writes", async () => {
    expect(await updateOwnerPermissionsAction(99, ["REPORTS_VIEW_FULL"])).toEqual({ success: true });
    expect(mocks.auth).toHaveBeenCalledWith({ write: true });
    expect(mocks.actor).toHaveBeenCalledWith("fixture-slug", "fixture-user");
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: 99, business_id: "fixture-business", user: { role: "OWNER" }, is_primary: false, permissions: { equals: ["SETTINGS_MANAGE"] } }, data: { permissions: ["REPORTS_VIEW_FULL"] } });
    expect(mocks.audit.mock.calls[0][0].data).toMatchObject({ entity_type: "Owner", entity_id: "99", actor_id: "fixture-user", business_id: "fixture-business", changes: { before: { permissions: ["SETTINGS_MANAGE"] }, after: { permissions: ["REPORTS_VIEW_FULL"], mode: "OWNER_PERMISSIONS_CHANGED" } } });
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.cache.mock.invocationCallOrder[0]);
  });

  it("does not write, audit or invalidate cache for unchanged permission sets", async () => {
    mocks.read.mockImplementation(async input => input.where.id === 99 ? { ...target, permissions: ["SETTINGS_MANAGE", "REPORTS_VIEW_FULL"] } : caller);
    expect(await updateOwnerPermissionsAction(99, ["REPORTS_VIEW_FULL", "SETTINGS_MANAGE", "SETTINGS_MANAGE"])).toEqual({ success: true });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("rejects restricted primary promotion without automatically granting settings capability", async () => {
    mocks.read.mockImplementation(async input => input.where.id === 99 ? { ...target, permissions: ["REPORTS_VIEW_FULL"] } : caller);
    expect(await setPrimaryOwnerAction(99)).toEqual({ success: false, error: "The primary owner must have SETTINGS_MANAGE." });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("audits the primary switch with verified actor and previous primary IDs", async () => {
    expect(await setPrimaryOwnerAction(99)).toEqual({ success: true });
    expect(mocks.audit.mock.calls[0][0].data).toMatchObject({ entity_type: "Business", entity_id: "fixture-business", actor_id: "fixture-user", business_id: "fixture-business", changes: { before: { primaryOwnerIds: [5] }, after: { primaryOwnerId: 99, mode: "PRIMARY_OWNER_CHANGED" } } });
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  });

  it("sets the first primary when none exists", async () => {
    mocks.primaries.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    expect(await setPrimaryOwnerAction(99)).toEqual({ success: true });
    expect(mocks.audit.mock.calls[0][0].data.changes.before.primaryOwnerIds).toEqual([]);
  });

  it.each(["clear", "promote"])("aborts an incomplete %s during primary switching", async stage => {
    if (stage === "clear") mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    else mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await setPrimaryOwnerAction(99)).toEqual({ success: false, error: "Owner settings changed. Refresh and try again." });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("aborts a stale permission replacement before audit/cache", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await updateOwnerPermissionsAction(99, ["REPORTS_VIEW_FULL"])).toEqual({ success: false, error: "Owner settings changed. Refresh and try again." });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each(["permissions", "primary"])("returns a refresh error for %s serialization conflicts", async mode => {
    mocks.transaction.mockRejectedValue({ code: "P2034", message: "private fixture" });
    const result = mode === "permissions" ? await updateOwnerPermissionsAction(99, ["REPORTS_VIEW_FULL"]) : await setPrimaryOwnerAction(99);
    expect(result).toEqual({ success: false, error: "Owner settings changed. Refresh and try again." });
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each(["auth", "actor", "read", "transaction", "updateMany", "audit"] as const)("sanitizes %s infrastructure failures for both actions", async stage => {
    mocks[stage].mockRejectedValue(new Error("private database fixture"));
    expect(await updateOwnerPermissionsAction(99, ["REPORTS_VIEW_FULL"])).toEqual({ success: false, error: "Failed to update permissions." });
    expect(await setPrimaryOwnerAction(99)).toEqual({ success: false, error: "Failed to set primary owner." });
    expect(mocks.cache).not.toHaveBeenCalled();
  });
});
