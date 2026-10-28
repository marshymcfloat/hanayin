import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), owner: vi.fn(), target: vi.fn(), unique: vi.fn(), update: vi.fn(), transaction: vi.fn(), audit: vi.fn(), sales: vi.fn(), saleAction: vi.fn(), conflict: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/lib/date-utils", () => ({ getCurrentDateTimePH: () => new Date("2026-09-17T04:00:00Z") }));
vi.mock("@/lib/services/booking-status", () => ({ promoteBookingToCompletedIfEligible: vi.fn() }));
vi.mock("@/lib/services/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/features/catalog/actions/sale-event", () => ({ getActiveSaleEvents: mocks.saleAction }));
vi.mock("@/features/bookings/services/availed-service-overlap", async importOriginal => ({ ...(await importOriginal<object>()), findAvailedServiceScheduleConflict: mocks.conflict }));
vi.mock("@/prisma/prisma", () => ({ prisma: { owner: { findFirst: mocks.owner }, availedService: { findFirst: mocks.target, findUnique: mocks.unique, updateMany: mocks.update }, saleEvent: { findMany: mocks.sales }, $transaction: mocks.transaction } }));
import { claimServiceAsOwnerAction, unclaimServiceAsOwnerAction } from "@/features/dashboard/actions/owner";
import { claimOwnerService, unclaimOwnerService } from "@/features/dashboard/services/owner-queue-claims";

const context = { success: true, actorType: "OWNER", role: "OWNER", businessId: "biz-a", businessSlug: "tenant-a", userId: "user-a", ownerId: 7, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "SINGLE_OWNER", allowEmployeeSelfBooking: false, managerCanServe: false } };
const tx = { owner: { findFirst: mocks.owner }, availedService: { findFirst: mocks.target, updateMany: mocks.update }, saleEvent: { findMany: mocks.sales } };
const pending = () => ({ id: 12, booking_id: 20, service_id: 3, package_id: null, price: 100, status: "PENDING", served_by_id: null, served_by_owner_id: null, served_by_type: null, claimed_at: null, served_at: null, completed_at: null, cancelled_at: null, paid_in_payslip_id: null, scheduled_at: new Date("2026-09-18T04:00:00Z"), estimated_end: new Date("2026-09-18T05:00:00Z"), booking: { status: "ACCEPTED" }, final_price: 100, discount: 0, discount_reason: null, commission_base: 100 });
const sale = { id: 1, title: "Promo", discount_type: "PERCENTAGE", discount_value: 20, slot_limit: null, slots_remaining: null, applicable_services: [{ id: 3 }], applicable_packages: [{ id: 4 }], _count: { bookings: 0 } };

describe("owner claim/unclaim public contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "user-a", role: "OWNER" } } });
    mocks.actor.mockResolvedValue(context);
    mocks.owner.mockResolvedValue({ id: 7 });
    mocks.unique.mockResolvedValue(pending());
    mocks.target.mockResolvedValue(pending());
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.sales.mockResolvedValue([]);
    mocks.saleAction.mockResolvedValue({ success: true, data: [] });
    mocks.conflict.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async callback => callback(tx));
  });
  it("claims an accepted pending item with original pricing and owner assignment", async () => {
    expect(await claimServiceAsOwnerAction(12)).toEqual({ success: true });
    expect(mocks.auth).toHaveBeenCalledWith({ write: true });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: "CLAIMED", served_by_owner_id: 7, served_by_id: null, served_by_type: "OWNER", claimed_at: new Date("2026-09-17T04:00:00Z"), final_price: 100, discount: 0, discount_reason: null, commission_base: 100 });
    expect(mocks.cache).toHaveBeenCalledWith("/app/tenant-a");
  });
  it("retains package sale pricing and commission snapshot", async () => {
    const target = { ...pending(), package_id: 4 };
    mocks.unique.mockResolvedValue(target); mocks.target.mockResolvedValue(target);
    mocks.saleAction.mockResolvedValue({ success: true, data: [sale] }); mocks.sales.mockResolvedValue([sale]);
    expect(await claimServiceAsOwnerAction(12)).toEqual({ success: true });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ final_price: 80, discount: 20, discount_reason: "Promo", commission_base: 80 });
  });
  it("unclaims self-assigned active work and restores its original price", async () => {
    const target = { ...pending(), status: "CLAIMED", served_by_owner_id: 7, served_by_type: "OWNER", claimed_at: new Date("2026-09-17T03:00:00Z") };
    mocks.unique.mockResolvedValue(target); mocks.target.mockResolvedValue(target);
    expect(await unclaimServiceAsOwnerAction(12)).toEqual({ success: true });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: "PENDING", served_by_owner_id: null, served_by_type: null, claimed_at: null, final_price: 100, discount: 0, discount_reason: null, commission_base: 100 });
    expect(mocks.cache).toHaveBeenCalledWith("/app/tenant-a");
  });
  it("preserves schedule conflict details without writes or cache invalidation", async () => {
    mocks.conflict.mockResolvedValue({ serviceName: "Other", scheduledAt: new Date("2026-09-18T04:00:00Z") });
    expect(await claimServiceAsOwnerAction(12)).toEqual({ success: false, code: "SCHEDULE_CONFLICT", error: "You already have another service scheduled during this time.", conflict: { serviceName: "Other", scheduledAt: "2026-09-18T04:00:00.000Z" } });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each([claimServiceAsOwnerAction, unclaimServiceAsOwnerAction])("denies malformed IDs before authentication", async action => {
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648, "bad", null, {}]) expect(await action(value as number)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("dispatches a previously supported coercible ID as its validated numeric value", async () => {
    expect(await claimServiceAsOwnerAction("12" as unknown as number)).toEqual({ success: true });
    expect(mocks.target.mock.calls[0][0].where.id).toBe(12);
  });
  it.each([claimServiceAsOwnerAction, unclaimServiceAsOwnerAction])("preserves auth denial and rejects staff/platform sessions before domain work", async action => {
    mocks.auth.mockResolvedValueOnce({ success: false, error: "Subscription expired" });
    expect(await action(12)).toEqual({ success: false, error: "Subscription expired" });
    for (const role of ["EMPLOYEE", "PLATFORM_ADMIN"]) {
      mocks.auth.mockResolvedValueOnce({ success: true, businessSlug: "tenant-a", session: { user: { id: "user-a", role } } });
      expect(await action(12)).toEqual({ success: false, error: "Unauthorized" });
    }
    expect(mocks.actor).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each([claimServiceAsOwnerAction, unclaimServiceAsOwnerAction])("denies stale owner context and handles auth infrastructure safely", async action => {
    for (const result of [{ success: false, error: "Private" }, { ...context, actorType: "EMPLOYEE" }]) {
      mocks.actor.mockResolvedValueOnce(result);
      expect(await action(12)).toEqual({ success: false, error: "Owner not found" });
    }
    mocks.auth.mockRejectedValueOnce(new Error("secret"));
    expect(await action(12)).toEqual({ success: false, error: action === claimServiceAsOwnerAction ? "Unable to claim service." : "Unable to unclaim service." });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("checks current membership, all tenant references, assignment/pricing/scheduling snapshots and audit atomically", async () => {
    expect(await claimServiceAsOwnerAction(12)).toEqual({ success: true });
    const actorWhere = { id: 7, user_id: "user-a", business_id: "biz-a", business: { slug: "tenant-a" }, user: { role: "OWNER" } };
    expect(mocks.owner).toHaveBeenCalledWith({ where: actorWhere, select: { id: true } });
    const scope = { booking: { business_id: "biz-a", business: { owners: { some: actorWhere } }, OR: [{ customer_id: null }, { customer: { business_id: "biz-a" } }] }, service: { business_id: "biz-a" }, OR: [{ package_id: null }, { package: { business_id: "biz-a" } }] };
    expect(mocks.target.mock.calls[0][0].where).toEqual({ id: 12, ...scope });
    expect(mocks.update.mock.calls[0][0].where).toEqual({ ...scope, id: 12, booking_id: 20, service_id: 3, package_id: null, price: 100, status: "PENDING", served_by_id: null, served_by_owner_id: null, served_by_type: null, claimed_at: null, served_at: null, completed_at: null, cancelled_at: null, paid_in_payslip_id: null, scheduled_at: pending().scheduled_at, estimated_end: pending().estimated_end, final_price: 100, discount: 0, discount_reason: null, commission_base: 100, AND: [{ booking: { status: "ACCEPTED", cancelled_at: null } }] });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(mocks.conflict).toHaveBeenCalledWith({ businessSlug: "tenant-a", serviceId: 12, providerType: "OWNER", providerId: 7 }, tx, scope);
    expect(mocks.sales.mock.calls[0][0]).toMatchObject({ where: { business_id: "biz-a", start_date: { lte: expect.any(Date) }, end_date: { gte: expect.any(Date) } }, select: { applicable_services: { where: { business_id: "biz-a" } }, applicable_packages: { where: { business_id: "biz-a" } }, _count: { select: { bookings: { where: { business_id: "biz-a", status: { not: "CANCELLED" } } } } } } });
    expect(mocks.saleAction).not.toHaveBeenCalled(); expect(mocks.unique).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(tx, expect.objectContaining({ entityType: "AvailedService", entityId: "12", actorId: "user-a", businessId: "biz-a", action: "STATUS_CHANGED", changes: { before: expect.objectContaining({ price: 100, status: "PENDING" }), after: expect.objectContaining({ mode: "OWNER_QUEUE_CLAIM", status: "CLAIMED" }) } }));
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]); expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.cache.mock.invocationCallOrder[0]);
  });
  it.each([claimServiceAsOwnerAction, unclaimServiceAsOwnerAction])("denies removed or role-revoked owner before reading the target", async action => {
    mocks.owner.mockResolvedValue(null);
    expect(await action(12)).toEqual({ success: false, error: "Owner not found" });
    expect(mocks.target).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each([claimServiceAsOwnerAction, unclaimServiceAsOwnerAction])("gives identical missing/foreign/reference-denied target results", async action => {
    mocks.target.mockResolvedValue(null);
    expect(await action(12)).toEqual({ success: false, error: "Service not found." });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.conflict).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each([
    { booking: { status: "PENDING" } }, { booking: { status: "ACCEPTED", cancelled_at: new Date() } }, { completed_at: new Date() }, { cancelled_at: new Date() }, { paid_in_payslip_id: 9 },
    { status: "CLAIMED" }, { served_by_owner_id: 8 }, { served_by_id: 5 }, { served_by_type: "OWNER" }, { claimed_at: new Date() }, { served_at: new Date() },
  ])("denies an unsupported or inconsistent claim snapshot %j", async change => {
    mocks.target.mockResolvedValue({ ...pending(), ...change });
    expect(await claimServiceAsOwnerAction(12)).toEqual({ success: false, error: "Service already claimed or not found." });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each([
    { status: "PENDING" }, { status: "COMPLETED" }, { status: "CANCELLED" }, { served_by_owner_id: 8 }, { served_by_id: 5 }, { served_by_type: "EMPLOYEE" },
    { booking: { status: "COMPLETED" } }, { completed_at: new Date() }, { cancelled_at: new Date() }, { paid_in_payslip_id: 9 },
  ])("denies unsupported unclaim edges without resetting terminal/payroll work %j", async change => {
    mocks.target.mockResolvedValue({ ...pending(), status: "CLAIMED", served_by_owner_id: 7, served_by_type: "OWNER", ...change });
    expect(await unclaimServiceAsOwnerAction(12)).toEqual({ success: false, error: "Unable to unclaim service." });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(["CLAIMED", "SERVING"])("unclaims %s self-owner work, clearing the active serve timestamp", async status => {
    mocks.target.mockResolvedValue({ ...pending(), status, served_by_owner_id: 7, served_by_type: "OWNER", served_at: status === "SERVING" ? new Date() : null });
    expect(await unclaimServiceAsOwnerAction(12)).toEqual({ success: true });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ served_at: null, served_by_id: null });
    expect(mocks.audit.mock.calls[0][1].changes.after.mode).toBe("OWNER_QUEUE_UNCLAIM"); expect(mocks.sales).not.toHaveBeenCalled();
  });
  it.each(["service", "package", "sold-out", "flat-cap"])("retains supported %s sale policy", async mode => {
    const packageId = mode === "package" ? 4 : null;
    mocks.target.mockResolvedValue({ ...pending(), package_id: packageId });
    mocks.sales.mockResolvedValue([{ ...sale, slot_limit: mode === "sold-out" ? 1 : null, _count: { bookings: mode === "sold-out" ? 1 : 0 }, ...(mode === "flat-cap" ? { discount_type: "FLAT", discount_value: 200 } : {}) }]);
    expect(await claimServiceAsOwnerAction(12)).toEqual({ success: true });
    expect(mocks.update.mock.calls[0][0].data.final_price).toBe(mode === "sold-out" ? 100 : mode === "flat-cap" ? 0 : 80);
  });
  it.each(["claim", "unclaim"])("maps conditional snapshot/assignment losses for %s without audit/cache", async mode => {
    if (mode === "unclaim") mocks.target.mockResolvedValue({ ...pending(), status: "CLAIMED", served_by_owner_id: 7, served_by_type: "OWNER" });
    mocks.update.mockResolvedValue({ count: 0 });
    expect(await (mode === "claim" ? claimServiceAsOwnerAction : unclaimServiceAsOwnerAction)(12)).toEqual({ success: false, error: mode === "claim" ? "Service already claimed or not found." : "Unable to unclaim service." });
    expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("prices the current transactional snapshot, not an earlier unscoped price", async () => {
    mocks.unique.mockResolvedValue({ ...pending(), price: 50 });
    mocks.target.mockResolvedValue({ ...pending(), price: 200, final_price: 200, commission_base: 200 });
    mocks.sales.mockResolvedValue([sale]);
    expect(await claimServiceAsOwnerAction(12)).toEqual({ success: true });
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ where: { price: 200, final_price: 200, commission_base: 200 }, data: { final_price: 160, discount: 40, commission_base: 160 } });
    expect(mocks.unique).not.toHaveBeenCalled();
  });
  it.each(["P2025", "P2034", "P2002", null, "private"])("maps transaction failure %j safely", async error => {
    mocks.transaction.mockRejectedValue(error === null || error === "private" ? error : { code: error });
    expect(await claimServiceAsOwnerAction(12)).toEqual({ success: false, error: error === "P2025" || error === "P2034" ? "Service already claimed or not found." : "Unable to claim service." });
    expect(await unclaimServiceAsOwnerAction(12)).toEqual({ success: false, error: "Unable to unclaim service." });
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("fails safely when sale lookup fails and propagates audit failure inside the transaction", async () => {
    mocks.sales.mockRejectedValueOnce(new Error("private SQL"));
    expect(await claimServiceAsOwnerAction(12)).toEqual({ success: false, error: "Unable to claim service." }); expect(mocks.update).not.toHaveBeenCalled();
    const error = new Error("private audit"); let caught: unknown;
    mocks.audit.mockRejectedValueOnce(error);
    mocks.transaction.mockImplementationOnce(async callback => { try { return await callback(tx); } catch (failure) { caught = failure; throw failure; } });
    expect(await claimServiceAsOwnerAction(12)).toEqual({ success: false, error: "Unable to claim service." }); expect(caught).toBe(error); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("preserves overlap exclusion errors and safely recovers optional details", async () => {
    mocks.update.mockRejectedValueOnce(new Error("AvailedService_owner_no_overlap_excl"));
    mocks.conflict.mockResolvedValueOnce(null).mockResolvedValueOnce({ serviceName: "Other", scheduledAt: new Date("2026-09-18") });
    const result = await claimServiceAsOwnerAction(12);
    expect(result).toMatchObject({ success: false, code: "SCHEDULE_CONFLICT", conflict: { serviceName: "Other", scheduledAt: "2026-09-18T00:00:00.000Z" } });
    expect(mocks.transaction).toHaveBeenCalledTimes(2); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(["revoked", "query-failure", "no-conflict"])("returns generic overlap details when recovery is %s", async mode => {
    mocks.update.mockRejectedValueOnce(new Error("AvailedService_owner_no_overlap_excl"));
    if (mode === "revoked") mocks.owner.mockResolvedValueOnce({ id: 7 }).mockResolvedValueOnce(null);
    if (mode === "query-failure") mocks.conflict.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("private"));
    expect(await claimServiceAsOwnerAction(12)).toEqual({ success: false, code: "SCHEDULE_CONFLICT", error: "You already have another service scheduled during this time." });
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each([claimServiceAsOwnerAction, unclaimServiceAsOwnerAction])("preserves committed success when cache is unavailable", async action => {
    if (action === unclaimServiceAsOwnerAction) mocks.target.mockResolvedValue({ ...pending(), status: "CLAIMED", served_by_owner_id: 7, served_by_type: "OWNER" });
    mocks.cache.mockImplementation(() => { throw new Error("private"); });
    expect(await action(12)).toEqual({ success: true }); expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it("rejects a forged direct non-owner context before transaction work", async () => {
    const employee = { ...context, actorType: "EMPLOYEE" } as unknown as Parameters<typeof claimOwnerService>[0];
    expect(await claimOwnerService(employee, 12)).toEqual({ success: false, error: "Unauthorized" });
    expect(await unclaimOwnerService(employee, 12)).toEqual({ success: false, error: "Unauthorized" }); expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
