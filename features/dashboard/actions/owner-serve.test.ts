import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailedService } from "@/prisma/generated/prisma/client";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), owner: vi.fn(), target: vi.fn(), unique: vi.fn(), update: vi.fn(), legacyUpdate: vi.fn(), bookingUpdate: vi.fn(), bookingLegacyUpdate: vi.fn(), transaction: vi.fn(), audit: vi.fn(), promote: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/lib/date-utils", () => ({ getCurrentDateTimePH: () => new Date("2026-09-17T04:00:00Z") }));
vi.mock("@/lib/services/booking-status", () => ({ promoteBookingToCompletedIfEligible: mocks.promote }));
vi.mock("@/lib/services/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/prisma/prisma", () => ({ prisma: { owner: { findFirst: mocks.owner }, $transaction: mocks.transaction } }));
import { markServiceServedAsOwnerAction, unserveServiceAsOwnerAction } from "@/features/dashboard/actions/owner";
import { serveOwnerService, undoOwnerServiceServing } from "@/features/dashboard/services/owner-queue-serving";

const context = { success: true, actorType: "OWNER", role: "OWNER", businessId: "biz-a", businessSlug: "tenant-a", userId: "user-a", ownerId: 7, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "SINGLE_OWNER", allowEmployeeSelfBooking: false, managerCanServe: false } };
const now = new Date("2026-09-17T04:00:00Z");
const claimed = (): AvailedService => ({ pricing_snapshot: null, selection_key: null, package_instance_id: null, package_choice_id: null, payroll_commission_rate: null, payroll_commission_base: null, payroll_commission_basis: null, payroll_agreement_id: null, payroll_payable_at: null, payroll_revision: 0, id: 12, booking_id: 20, service_id: 3, package_id: null, price: 100, estimated_cost: 30, final_price: 80, discount: 20, discount_reason: "Promo", commission_base: 80, status: "CLAIMED", served_by_id: null, served_by_owner_id: 7, served_by_type: "OWNER", claimed_at: new Date("2026-09-17T03:00:00Z"), served_at: null, completed_at: null, cancelled_at: null, paid_in_payslip_id: null, scheduled_at: new Date("2026-09-18T04:00:00Z"), estimated_end: new Date("2026-09-18T05:00:00Z"), created_at: now, updated_at: now });
let snapshot: ReturnType<typeof claimed> & { booking: { status: string; cancelled_at: Date | null; customer_id: string | null } };
let output: ReturnType<typeof claimed>;
const tx = { owner: { findFirst: mocks.owner }, availedService: { findFirst: mocks.target, findUnique: mocks.unique, updateMany: mocks.update, update: mocks.legacyUpdate }, booking: { updateMany: mocks.bookingUpdate, update: mocks.bookingLegacyUpdate } };

describe("owner serve/undo-serve public contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    snapshot = { ...claimed(), booking: { status: "ACCEPTED", cancelled_at: null, customer_id: "customer-a" } };
    output = { ...claimed(), status: "COMPLETED", served_at: now, completed_at: now } as ReturnType<typeof claimed>;
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "user-a", role: "OWNER" } } });
    mocks.actor.mockResolvedValue(context); mocks.owner.mockResolvedValue({ id: 7 });
    mocks.unique.mockImplementation(async args => args.select ? snapshot : output);
    mocks.target.mockImplementation(async args => args.select.booking ? snapshot : output);
    mocks.legacyUpdate.mockImplementation(async () => output);
    mocks.update.mockResolvedValue({ count: 1 }); mocks.bookingUpdate.mockResolvedValue({ count: 1 });
    mocks.promote.mockResolvedValue(false);
    mocks.transaction.mockImplementation(async callback => callback(tx));
  });
  it("serves accepted self-owner work with PH dates, full scalar DTO and unchanged pricing", async () => {
    expect(await markServiceServedAsOwnerAction(12)).toEqual({ success: true, data: output });
    expect(mocks.auth).toHaveBeenCalledWith({ write: true });
    expect(mocks.update.mock.calls[0][0].data).toEqual({ status: "COMPLETED", served_at: now, completed_at: now });
    expect(mocks.promote.mock.calls[0].slice(0, 2)).toEqual([tx, 20]);
    expect(mocks.cache).toHaveBeenCalledWith("/app/tenant-a");
  });
  it("undoes completed work and reopens a completed parent without repricing", async () => {
    snapshot = { ...snapshot, status: "COMPLETED", served_at: now, completed_at: now, booking: { ...snapshot.booking, status: "COMPLETED" } } as typeof snapshot;
    output = claimed();
    expect(await unserveServiceAsOwnerAction(12)).toEqual({ success: true, data: output });
    expect(mocks.update.mock.calls[0][0].data).toEqual({ status: "CLAIMED", served_at: null, completed_at: null });
    expect(mocks.bookingUpdate).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 20, business_id: "biz-a", status: "COMPLETED" }), data: { status: "ACCEPTED" } });
    expect(mocks.promote).not.toHaveBeenCalled(); expect(mocks.cache).toHaveBeenCalledWith("/app/tenant-a");
  });
  it("undoes a completed line of an accepted parent without changing parent state", async () => {
    snapshot = { ...snapshot, status: "COMPLETED", served_at: now, completed_at: now } as typeof snapshot;
    output = claimed();
    expect(await unserveServiceAsOwnerAction(12)).toEqual({ success: true, data: output });
    expect(mocks.bookingUpdate).not.toHaveBeenCalled(); expect(mocks.promote).not.toHaveBeenCalled();
  });
  it("retains existing write-auth denial before persistence", async () => {
    mocks.auth.mockResolvedValue({ success: false, error: "Subscription expired" });
    expect(await markServiceServedAsOwnerAction(12)).toEqual({ success: false, error: "Subscription expired" });
    expect(await unserveServiceAsOwnerAction(12)).toEqual({ success: false, error: "Subscription expired" });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  function complete(parent = "ACCEPTED") {
    snapshot = { ...snapshot, status: "COMPLETED", served_at: now, completed_at: now, booking: { ...snapshot.booking, status: parent } } as typeof snapshot;
    output = claimed();
  }
  const cases = [
    { action: markServiceServedAsOwnerAction, domain: serveOwnerService, error: "Unable to mark as served.", undo: false },
    { action: unserveServiceAsOwnerAction, domain: undoOwnerServiceServing, error: "Unable to unserve.", undo: true },
  ];
  it.each(cases)("validates IDs before authentication for $undo", async ({ action }) => {
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648, "bad", null, {}]) expect(await action(value as number)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(cases)("passes a supported coercible ID as a validated number for $undo", async ({ action, undo }) => {
    if (undo) complete();
    expect((await action("12" as unknown as number)).success).toBe(true);
    expect(mocks.target.mock.calls[0][0].where.id).toBe(12);
  });
  it.each(cases)("rejects non-owner sessions and resolved contexts for $undo", async ({ action }) => {
    for (const role of ["EMPLOYEE", "PLATFORM_ADMIN"]) {
      mocks.auth.mockResolvedValueOnce({ success: true, businessSlug: "tenant-a", session: { user: { id: "user-a", role } } });
      expect(await action(12)).toEqual({ success: false, error: "Unauthorized" });
    }
    expect(mocks.actor).not.toHaveBeenCalled();
    for (const actor of [{ success: false, error: "Private" }, { ...context, actorType: "EMPLOYEE" }]) {
      mocks.actor.mockResolvedValueOnce(actor);
      expect(await action(12)).toEqual({ success: false, error: "Owner not found" });
    }
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(cases)("denies current role/membership revocation before target lookup for $undo", async ({ action }) => {
    mocks.owner.mockResolvedValue(null);
    expect(await action(12)).toEqual({ success: false, error: "Owner not found" });
    expect(mocks.owner.mock.calls[0][0].where).toEqual({ id: 7, user_id: "user-a", business_id: "biz-a", business: { slug: "tenant-a" }, user: { role: "OWNER" } });
    expect(mocks.target).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(cases)("repeats tenant references and snapshots in mutation and scopes the DTO reload for $undo", async ({ action, undo }) => {
    if (undo) complete("COMPLETED");
    expect((await action(12)).success).toBe(true);
    const membership = { id: 7, user_id: "user-a", business_id: "biz-a", business: { slug: "tenant-a" }, user: { role: "OWNER" } };
    const booking = { business_id: "biz-a", business: { owners: { some: membership } }, OR: [{ customer_id: null }, { customer: { business_id: "biz-a" } }] };
    const scope = { booking, service: { business_id: "biz-a" }, OR: [{ package_id: null }, { package: { business_id: "biz-a" } }] };
    const parent = { ...booking, status: snapshot.booking.status, cancelled_at: null, customer_id: "customer-a" };
    expect(mocks.target.mock.calls[0][0].where).toEqual({ id: 12, ...scope });
    expect(mocks.update.mock.calls[0][0].where).toEqual({ ...scope, id: 12, booking_id: 20, service_id: 3, package_id: null, status: snapshot.status, served_by_owner_id: 7, served_by_id: null, served_by_type: "OWNER", claimed_at: snapshot.claimed_at, served_at: snapshot.served_at, completed_at: snapshot.completed_at, cancelled_at: null, paid_in_payslip_id: null, updated_at: now, AND: [{ booking: parent }] });
    expect(mocks.target.mock.calls[1][0].where).toEqual({ id: 12, booking_id: 20, ...scope, served_by_owner_id: 7, served_by_id: null, served_by_type: "OWNER", status: undo ? "CLAIMED" : "COMPLETED" });
    expect(mocks.target.mock.calls[1][0].select).toEqual(Object.fromEntries(Object.keys(claimed()).map(key => [key, true])));
    expect(mocks.unique).not.toHaveBeenCalled(); expect(mocks.legacyUpdate).not.toHaveBeenCalled(); expect(mocks.bookingLegacyUpdate).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    if (undo) expect(mocks.bookingUpdate.mock.calls[0][0].where).toEqual({ id: 20, ...parent });
    else expect(mocks.promote).toHaveBeenCalledWith(tx, 20, { businessId: "biz-a", booking: parent });
    expect(mocks.audit.mock.calls[0]).toEqual([tx, expect.objectContaining({ actorId: "user-a", businessId: "biz-a", entityType: "AvailedService", entityId: "12", action: "STATUS_CHANGED", changes: { before: { status: snapshot.status, served_at: snapshot.served_at, completed_at: snapshot.completed_at, served_by_owner_id: 7 }, after: { status: undo ? "CLAIMED" : "COMPLETED", served_at: undo ? null : now, completed_at: undo ? null : now, mode: undo ? "OWNER_QUEUE_UNDO_SERVE" : "OWNER_QUEUE_SERVE" } } })]);
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]);
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.cache.mock.invocationCallOrder[0]);
  });
  it.each(cases)("does not leak missing/foreign/reference-denied targets for $undo", async ({ action, error }) => {
    mocks.target.mockResolvedValue(null);
    expect(await action(12)).toEqual({ success: false, error });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(cases.flatMap(item => [
    { served_by_owner_id: 8 }, { served_by_id: 5 }, { served_by_type: "EMPLOYEE" }, { served_by_type: null },
    { cancelled_at: now }, { booking: { status: "ACCEPTED", cancelled_at: now, customer_id: "customer-a" } }, { paid_in_payslip_id: 9 },
  ].map(change => ({ ...item, change }))))("denies assignment, cancellation or payroll inconsistency $change for $undo", async ({ action, undo, error, change }) => {
    if (undo) complete();
    snapshot = { ...snapshot, ...change } as typeof snapshot;
    expect(await action(12)).toEqual({ success: false, error });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each([
    { status: "PENDING" }, { status: "COMPLETED" }, { status: "CANCELLED" }, { completed_at: now },
    { booking: { status: "HOLD", cancelled_at: null, customer_id: "customer-a" } },
    { booking: { status: "COMPLETED", cancelled_at: null, customer_id: "customer-a" } },
    { booking: { status: "CANCELLED", cancelled_at: null, customer_id: "customer-a" } },
  ])("denies unsupported serve/duplicate state %j", async change => {
    snapshot = { ...snapshot, ...change } as typeof snapshot;
    expect(await markServiceServedAsOwnerAction(12)).toEqual({ success: false, error: "Unable to mark as served." });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each([
    { status: "PENDING" }, { status: "CLAIMED" }, { status: "SERVING" }, { status: "CANCELLED" }, { completed_at: null },
    { booking: { status: "HOLD", cancelled_at: null, customer_id: "customer-a" } },
    { booking: { status: "CANCELLED", cancelled_at: null, customer_id: "customer-a" } },
  ])("denies unsupported undo/duplicate state %j", async change => {
    complete(); snapshot = { ...snapshot, ...change } as typeof snapshot;
    expect(await unserveServiceAsOwnerAction(12)).toEqual({ success: false, error: "Unable to unserve." });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("retains serving→completed timestamps and audits payment-independent booking promotion", async () => {
    snapshot = { ...snapshot, status: "SERVING", served_at: new Date("2026-09-17T03:30:00Z") } as typeof snapshot;
    mocks.promote.mockResolvedValue(true);
    expect((await markServiceServedAsOwnerAction(12)).success).toBe(true);
    expect(mocks.update.mock.calls[0][0].data).toEqual({ status: "COMPLETED", served_at: now, completed_at: now });
    expect(mocks.audit.mock.calls[1]).toEqual([tx, { actorId: "user-a", businessId: "biz-a", entityType: "Booking", entityId: "20", action: "STATUS_CHANGED", changes: { before: { status: "ACCEPTED" }, after: { status: "COMPLETED", mode: "OWNER_QUEUE_SERVE" } } }]);
    expect(mocks.audit).toHaveBeenCalledTimes(2);
  });
  it.each(cases)("supports anonymous walk-ins for $undo without requiring a customer", async ({ action, undo }) => {
    if (undo) complete(); snapshot.booking.customer_id = null;
    expect((await action(12)).success).toBe(true);
    expect(mocks.update.mock.calls[0][0].where.AND[0].booking.customer_id).toBe(null);
  });
  it.each(cases)("maps stale mutation/reload results for $undo to a rollback-producing failure", async ({ action, undo, error }) => {
    if (undo) complete(); mocks.update.mockResolvedValueOnce({ count: 0 });
    expect(await action(12)).toEqual({ success: false, error }); expect(mocks.audit).not.toHaveBeenCalled();
    mocks.target.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(null);
    expect(await action(12)).toEqual({ success: false, error }); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("does not succeed when a completed parent loses its reopen snapshot", async () => {
    complete("COMPLETED"); mocks.bookingUpdate.mockResolvedValue({ count: 0 });
    expect(await unserveServiceAsOwnerAction(12)).toEqual({ success: false, error: "Unable to unserve." });
    expect(mocks.update).toHaveBeenCalledOnce(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(cases)("maps auth, role lookup, transaction, audit and second-write failures safely for $undo", async ({ action, undo, error }) => {
    if (undo) complete("COMPLETED"); else mocks.promote.mockResolvedValue(true);
    for (const operation of [mocks.auth, mocks.actor, mocks.owner, mocks.transaction, mocks.update, undo ? mocks.bookingUpdate : mocks.promote, mocks.audit]) {
      operation.mockRejectedValueOnce(new Error("SQL/private-secret"));
      expect(await action(12)).toEqual({ success: false, error }); expect(mocks.cache).not.toHaveBeenCalled();
    }
    mocks.audit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Private booking audit"));
    expect(await action(12)).toEqual({ success: false, error }); expect(mocks.cache).not.toHaveBeenCalled();
    for (const reason of [{ code: "P2034" }, { code: "P2025" }, null]) {
      mocks.transaction.mockRejectedValueOnce(reason);
      expect(await action(12)).toEqual({ success: false, error });
    }
  });
  it.each(cases)("preserves committed success when cache fails for $undo", async ({ action, undo }) => {
    if (undo) complete(); mocks.cache.mockImplementation(() => { throw new Error("Private cache failure"); });
    expect(await action(12)).toEqual({ success: true, data: output }); expect(mocks.audit).toHaveBeenCalledOnce();
  });
  it.each(cases)("rejects an incorrect actor at the domain boundary for $undo", async ({ domain }) => {
    expect(await domain({ ...context, actorType: "EMPLOYEE" } as unknown as Parameters<typeof domain>[0], 12)).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

