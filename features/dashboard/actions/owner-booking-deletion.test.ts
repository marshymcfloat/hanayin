import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), business: vi.fn(), user: vi.fn(), txBusiness: vi.fn(), txUser: vi.fn(), remove: vi.fn(), legacyRemove: vi.fn(), transaction: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.business }, user: { findUnique: mocks.user }, booking: { delete: mocks.legacyRemove }, $transaction: mocks.transaction } }));
import { deleteBookingAction } from "@/features/dashboard/actions/owner";
import { deleteBookingPermanently } from "@/features/bookings/services/booking-deletion";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";

const business = { id: "biz-a", slug: "tenant-a", structure: "MANAGER_LED", allow_employee_self_booking: false, manager_can_serve: false };
const owner = () => ({ id: "user-a", role: "OWNER", owner: { id: 7, business_id: "biz-a" }, employee: null });
const employee = () => ({ id: "user-a", role: "EMPLOYEE", owner: null, employee: { id: 9, business_id: "biz-a", profile: "MANAGER", permissions: ["BOOKING_MODIFY", "BOOKING_CANCEL"] } });
const tx = { business: { findUnique: mocks.txBusiness }, user: { findUnique: mocks.txUser }, booking: { delete: mocks.remove } };
let deleted: boolean;
const run = () => deleteBookingAction(20);
function unchanged() { expect(deleted).toBe(false); expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled(); }

describe("permanent booking deletion characterization and protected command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "user-a", role: "OWNER" } } });
    mocks.business.mockResolvedValue(business); mocks.txBusiness.mockResolvedValue(business);
    mocks.user.mockResolvedValue(owner()); mocks.txUser.mockResolvedValue(owner());
    deleted = false;
    mocks.remove.mockImplementation(async () => { deleted = true; return { id: 20 }; });
    mocks.transaction.mockImplementation(async work => { const before = deleted; try { return await work(tx); } catch (error) { deleted = before; throw error; } });
  });
  it("deletes only the authenticated tenant booking and invalidates after success", async () => {
    expect(await deleteBookingAction(20)).toEqual({ success: true });
    expect(mocks.auth).toHaveBeenCalledWith({ write: true });
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: 20, business_id: "biz-a", vouchers: { every: { business_id: "biz-a" } }, availed_services: { every: { price_adjustments: { every: { booking: { business_id: "biz-a" } } } } }, business: { id: "biz-a", slug: "tenant-a", owners: { some: { id: 7, user_id: "user-a", business_id: "biz-a", user: { role: "OWNER" } } } } }, select: { id: true } });
    expect(mocks.cache).toHaveBeenCalledWith("/app/tenant-a");
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.cache.mock.invocationCallOrder[0]);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(deleted).toBe(true); expect(mocks.legacyRemove).not.toHaveBeenCalled();
  });
  it("rejects invalid input before auth or persistence", async () => {
    expect(await deleteBookingAction(0)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("preserves the subscription write denial", async () => {
    mocks.auth.mockResolvedValue({ success: false, error: "Subscription expired" });
    expect(await deleteBookingAction(20)).toEqual({ success: false, error: "Subscription expired" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("denies non-owner sessions", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "user-a", role: "EMPLOYEE" } } });
    expect(await deleteBookingAction(20)).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("preserves missing-record punctuation without invalidation", async () => {
    mocks.remove.mockRejectedValue({ code: "P2025", message: "internal SQL detail" });
    expect(await deleteBookingAction(20)).toEqual({ success: false, error: "Failed to delete." });
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("returns a safe generic persistence failure", async () => {
    mocks.remove.mockRejectedValue(new Error("secret internal SQL detail"));
    expect(await deleteBookingAction(20)).toEqual({ success: false, error: "Failed to delete" });
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN, Infinity, 2147483648, "bad", null, {}])("rejects malformed or oversized ID %s before auth", async id => {
    expect(await deleteBookingAction(id as number)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled(); unchanged();
  });
  it("uses the validated numeric ID instead of the coercible transport input", async () => {
    expect(await deleteBookingAction("20" as unknown as number)).toEqual({ success: true });
    expect(mocks.remove.mock.calls[0][0].where.id).toBe(20);
  });
  it("accepts the maximum PostgreSQL integer ID", async () => {
    expect(await deleteBookingAction(2147483647)).toEqual({ success: true });
    expect(mocks.remove.mock.calls[0][0].where.id).toBe(2147483647);
  });
  it.each(["EMPLOYEE", "PLATFORM_ADMIN"])("denies %s session before current-owner lookup", async role => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "user-a", role } } });
    expect(await run()).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled(); unchanged();
  });
  it.each(["missing-business", "missing-user", "removed-owner", "foreign-owner", "employee-role", "platform-role"])("denies initially stale %s before transaction", async state => {
    if (state === "missing-business") mocks.business.mockResolvedValue(null);
    if (state === "missing-user") mocks.user.mockResolvedValue(null);
    if (state === "removed-owner") mocks.user.mockResolvedValue({ ...owner(), owner: null });
    if (state === "foreign-owner") mocks.user.mockResolvedValue({ ...owner(), owner: { id: 7, business_id: "foreign" } });
    if (state === "employee-role") mocks.user.mockResolvedValue(employee());
    if (state === "platform-role") mocks.user.mockResolvedValue({ ...owner(), role: "PLATFORM_ADMIN" });
    expect(await run()).toEqual({ success: false, error: state.startsWith("missing-") || state === "employee-role" ? "Unauthorized" : "Forbidden" });
    expect(mocks.transaction).not.toHaveBeenCalled(); unchanged();
  });
  it.each(["missing-business", "missing-user", "business-id", "business-slug", "removed-owner", "replaced-owner", "foreign-owner", "employee-role", "platform-role"])("rechecks transactional %s before deletion", async state => {
    if (state === "missing-business") mocks.txBusiness.mockResolvedValue(null);
    if (state === "missing-user") mocks.txUser.mockResolvedValue(null);
    if (state === "business-id") {
      mocks.txBusiness.mockResolvedValue({ ...business, id: "foreign" });
      mocks.txUser.mockResolvedValue({ ...owner(), owner: { id: 7, business_id: "foreign" } });
    }
    if (state === "business-slug") mocks.txBusiness.mockResolvedValue({ ...business, slug: "foreign" });
    if (state === "removed-owner") mocks.txUser.mockResolvedValue({ ...owner(), owner: null });
    if (state === "replaced-owner") mocks.txUser.mockResolvedValue({ ...owner(), owner: { id: 8, business_id: "biz-a" } });
    if (state === "foreign-owner") mocks.txUser.mockResolvedValue({ ...owner(), owner: { id: 7, business_id: "foreign" } });
    if (state === "employee-role") mocks.txUser.mockResolvedValue(employee());
    if (state === "platform-role") mocks.txUser.mockResolvedValue({ ...owner(), role: "PLATFORM_ADMIN" });
    expect(await run()).toEqual({ success: false, error: "Forbidden" }); unchanged();
  });
  it("does not introduce deletion state, payment, retention or customer restrictions", async () => {
    expect(await run()).toEqual({ success: true });
    expect(Object.keys(mocks.remove.mock.calls[0][0].where).sort()).toEqual(["availed_services", "business", "business_id", "id", "vouchers"]);
    expect(mocks.txBusiness).toHaveBeenCalledOnce(); expect(mocks.txUser).toHaveBeenCalledOnce();
  });
  it.each(["auth", "actor", "tx-actor", "transaction", "delete"])("returns safe %s infrastructure failure without invalidation", async step => {
    const error = new Error("secret SQL/internal detail");
    if (step === "auth") mocks.auth.mockRejectedValue(error);
    if (step === "actor") mocks.user.mockRejectedValue(error);
    if (step === "tx-actor") mocks.txUser.mockRejectedValue(error);
    if (step === "transaction") mocks.transaction.mockRejectedValue({ code: "P2034", message: error.message });
    if (step === "delete") mocks.remove.mockRejectedValue(error);
    expect(await run()).toEqual({ success: false, error: "Failed to delete" });
    expect(deleted).toBe(false); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each([null, "internal SQL detail", { code: "P2003", message: "foreign key detail" }])("handles unusual failure %s safely", async error => {
    mocks.remove.mockRejectedValue(error);
    expect(await run()).toEqual({ success: false, error: "Failed to delete" }); expect(deleted).toBe(false); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("does not invalidate or retry when commit fails after deletion", async () => {
    mocks.transaction.mockImplementation(async work => { await work(tx); deleted = false; throw new Error("Fixture commit failure"); });
    expect(await run()).toEqual({ success: false, error: "Failed to delete" });
    expect(deleted).toBe(false); expect(mocks.transaction).toHaveBeenCalledOnce(); expect(mocks.remove).toHaveBeenCalledOnce(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("does not report committed deletion as failed when invalidation throws", async () => {
    mocks.cache.mockImplementation(() => { throw new Error("cache unavailable"); });
    expect(await run()).toEqual({ success: true }); expect(deleted).toBe(true); expect(mocks.transaction).toHaveBeenCalledOnce();
  });
  it("awaits transaction commit before invalidating", async () => {
    let release!: () => void;
    let reached!: () => void;
    const committed = new Promise<void>(resolve => { release = resolve; });
    const writeFinished = new Promise<void>(resolve => { reached = resolve; });
    mocks.transaction.mockImplementation(async work => { const result = await work(tx); reached(); await committed; return result; });
    const pending = run(); await writeFinished;
    expect(deleted).toBe(true); expect(mocks.cache).not.toHaveBeenCalled(); release();
    expect(await pending).toEqual({ success: true }); expect(mocks.cache).toHaveBeenCalledOnce();
  });
  it("protects direct service calls from invalid IDs before persistence", async () => {
    const actor = await resolveTenantActorContext("tenant-a", "user-a");
    if (!actor.success || actor.actorType !== "OWNER") throw new Error("Fixture owner missing");
    expect(await deleteBookingPermanently(actor, 2147483648)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.transaction).not.toHaveBeenCalled(); unchanged();
  });
  it.each(["EMPLOYEE", "PLATFORM_ADMIN"] as const)("rejects direct service forged %s role", async role => {
    const actor = await resolveTenantActorContext("tenant-a", "user-a");
    if (!actor.success || actor.actorType !== "OWNER") throw new Error("Fixture owner missing");
    expect(await deleteBookingPermanently({ ...actor, role }, 20)).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.transaction).not.toHaveBeenCalled(); unchanged();
  });
  it("rejects direct employee context without expanding employee permissions", async () => {
    mocks.user.mockResolvedValue(employee());
    const actor = await resolveTenantActorContext("tenant-a", "user-a");
    if (!actor.success) throw new Error("Fixture employee missing");
    expect(await deleteBookingPermanently(actor as Parameters<typeof deleteBookingPermanently>[0], 20)).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.transaction).not.toHaveBeenCalled(); unchanged();
  });
});
