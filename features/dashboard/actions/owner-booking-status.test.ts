import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingStatus, StaffPermission, StaffProfile } from "@/prisma/generated/prisma/client";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), business: vi.fn(), user: vi.fn(), txBusiness: vi.fn(), txUser: vi.fn(), booking: vi.fn(), update: vi.fn(), legacyUpdate: vi.fn(), audit: vi.fn(), transaction: vi.fn(), cache: vi.fn(), customerUpdate: vi.fn(), serviceUpdate: vi.fn(), outbox: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.business }, user: { findUnique: mocks.user }, booking: { update: mocks.legacyUpdate }, $transaction: mocks.transaction } }));
import { updateBookingStatusAction } from "@/features/dashboard/actions/owner";
import { completeBookingManually } from "@/features/bookings/services/booking-status";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";

const now = new Date("2030-01-15T09:00:00Z");
const business = { id: "biz-a", slug: "tenant-a", structure: "MANAGER_LED", allow_employee_self_booking: false, manager_can_serve: false };
const owner = () => ({ id: "user-a", role: "OWNER", owner: { id: 7, business_id: "biz-a" }, employee: null });
const employee = (profile: StaffProfile = "MANAGER", permissions: StaffPermission[] = ["BOOKING_MODIFY"]) => ({ id: "user-a", role: "EMPLOYEE", owner: null, employee: { id: 9, business_id: "biz-a", profile, permissions } });
let booking: { id: number; status: BookingStatus; customer_id: string | null; payment_status: string; amount_paid: number; grand_total: number; cancelled_at: Date | null; cancelled_by_customer: boolean; updated_at: Date; _count: { availed_services: number } };
const tx = { business: { findUnique: mocks.txBusiness }, user: { findUnique: mocks.txUser }, booking: { findFirst: mocks.booking, updateMany: mocks.update, update: mocks.legacyUpdate }, auditLog: { create: mocks.audit }, customer: { updateMany: mocks.customerUpdate }, availedService: { updateMany: mocks.serviceUpdate }, outboxMessage: { create: mocks.outbox } };
const run = () => updateBookingStatusAction(20, "COMPLETED");
function unchanged() { expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled(); }

describe("manual booking status characterization and protected command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    booking = { id: 20, status: "ACCEPTED", customer_id: "customer-a", payment_status: "PAID", amount_paid: 799, grand_total: 799, cancelled_at: null, cancelled_by_customer: false, updated_at: now, _count: { availed_services: 0 } };
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "user-a", role: "OWNER" } } });
    mocks.business.mockResolvedValue(business); mocks.txBusiness.mockResolvedValue(business);
    mocks.user.mockResolvedValue(owner()); mocks.txUser.mockResolvedValue(owner());
    mocks.booking.mockImplementation(async () => structuredClone(booking));
    mocks.update.mockImplementation(async ({ data }) => { Object.assign(booking, data); return { count: 1 }; });
    mocks.transaction.mockImplementation(async work => { const before = structuredClone(booking); try { return await work(tx); } catch (error) { booking = before; throw error; } });
  });
  it("preserves paid completion and invalidation after the atomic verified audit", async () => {
    expect(await run()).toEqual({ success: true }); expect(booking.status).toBe("COMPLETED");
    expect(mocks.auth).toHaveBeenCalledWith({ write: true }); expect(mocks.cache).toHaveBeenCalledWith("/app/tenant-a");
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(mocks.audit).toHaveBeenCalledWith({ data: { entity_type: "Booking", entity_id: "20", action: "STATUS_CHANGED", actor_id: "user-a", actor_type: "USER", business_id: "biz-a", changes: { before: { status: "ACCEPTED" }, after: { status: "COMPLETED", mode: "BOOKING_MANUAL_COMPLETION" } } } });
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]); expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.cache.mock.invocationCallOrder[0]);
    expect(mocks.legacyUpdate).not.toHaveBeenCalled(); expect(mocks.customerUpdate).not.toHaveBeenCalled(); expect(mocks.serviceUpdate).not.toHaveBeenCalled(); expect(mocks.outbox).not.toHaveBeenCalled();
  });
  it.each(["UNPAID", "PARTIALLY_PAID"])("preserves %s settlement denial", async payment => {
    booking.payment_status = payment; expect(await run()).toEqual({ success: false, error: "Booking cannot be completed until payment is fully settled." }); unchanged();
  });
  it("preserves missing booking and subscription denials", async () => {
    mocks.booking.mockResolvedValue(null); expect(await run()).toEqual({ success: false, error: "Booking not found." });
    mocks.auth.mockResolvedValue({ success: false, error: "Subscription expired" }); expect(await run()).toEqual({ success: false, error: "Subscription expired" }); unchanged();
  });
  it.each([0, -1, 1.5, NaN, Infinity, 2147483648, "bad", null, {}])("rejects malformed or oversized ID %s before auth", async id => {
    expect(await updateBookingStatusAction(id as number, "COMPLETED")).toEqual({ success: false, error: "Invalid input" }); expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled(); unchanged();
  });
  it("uses validated coercible ID instead of the original transport value", async () => {
    expect(await updateBookingStatusAction("20" as unknown as number, "COMPLETED")).toEqual({ success: true }); expect(mocks.booking.mock.calls[0][0].where.id).toBe(20);
  });
  it.each(["OTHER", null, {}])("rejects malformed status %s before auth", async status => {
    expect(await updateBookingStatusAction(20, status as BookingStatus)).toEqual({ success: false, error: "Invalid input" }); expect(mocks.auth).not.toHaveBeenCalled(); unchanged();
  });
  it("rejects generic cancellation before auth or persistence", async () => {
    expect(await updateBookingStatusAction(20, "CANCELLED")).toEqual({ success: false, error: "Use the cancellation workflow and provide a reason." }); expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.booking).not.toHaveBeenCalled(); unchanged();
  });
  it.each(["HOLD", "ACCEPTED"] as const)("rejects arbitrary target %s before auth", async status => {
    expect(await updateBookingStatusAction(20, status)).toEqual({ success: false, error: "Unsupported manual status transition." }); expect(mocks.auth).not.toHaveBeenCalled(); unchanged();
  });
  it.each(["HOLD", "CANCELLED", "COMPLETED", "soft-cancelled", "customer-cancelled"])("denies %s source without reopening or another audit", async status => {
    if (status === "soft-cancelled") booking.cancelled_at = now; else if (status === "customer-cancelled") booking.cancelled_by_customer = true; else booking.status = status as BookingStatus;
    expect(await run()).toEqual({ success: false, error: "Only active accepted bookings can be manually completed." }); unchanged();
  });
  it("denies unfinished work regardless of prepayment, provider or payroll association", async () => {
    booking._count.availed_services = 1; expect(await run()).toEqual({ success: false, error: "All service lines must be completed or cancelled first." }); unchanged();
    expect(mocks.booking.mock.calls[0][0].select._count).toEqual({ select: { availed_services: { where: { status: { notIn: ["COMPLETED", "CANCELLED"] } } } } });
  });
  it("supports anonymous completion without financial or customer-trust writes", async () => {
    booking.customer_id = null; expect(await run()).toEqual({ success: true }); expect(booking).toMatchObject({ customer_id: null, amount_paid: 799, payment_status: "PAID" }); expect(mocks.customerUpdate).not.toHaveBeenCalled(); expect(mocks.serviceUpdate).not.toHaveBeenCalled();
  });
  it("repeats current membership/policy, tenant references, payment and work eligibility on conditional write", async () => {
    expect(await run()).toEqual({ success: true });
    const access = { ...business, owners: { some: { id: 7, user_id: "user-a", business_id: "biz-a", user: { role: "OWNER" } } } };
    const references = { service: { business_id: "biz-a" }, OR: [{ package_id: null }, { package: { business_id: "biz-a" } }] };
    const scope = { business_id: "biz-a", business: access, OR: [{ customer_id: null }, { customer: { business_id: "biz-a" } }], availed_services: { every: references } };
    expect(mocks.booking.mock.calls[0][0].where).toEqual({ id: 20, ...scope });
    expect(mocks.update).toHaveBeenCalledWith({ where: { ...scope, id: 20, status: "ACCEPTED", customer_id: "customer-a", payment_status: "PAID", amount_paid: 799, grand_total: 799, cancelled_at: null, cancelled_by_customer: false, updated_at: now, availed_services: { every: references, none: { status: { notIn: ["COMPLETED", "CANCELLED"] } } } }, data: { status: "COMPLETED" } });
    expect(mocks.txBusiness).toHaveBeenCalledOnce(); expect(mocks.txUser).toHaveBeenCalledOnce();
  });
  it.each(["STAFF", "MANAGER", "CASHIER"] as const)("preserves explicit %s MODIFY grants without unrelated policy gates", async profile => {
    mocks.user.mockResolvedValue(employee(profile)); mocks.txUser.mockResolvedValue(employee(profile)); expect(await run()).toEqual({ success: true });
    const membership = mocks.update.mock.calls[0][0].where.business.employees.some;
    expect(membership).toMatchObject({ id: 9, user_id: "user-a", business_id: "biz-a", user: { role: "EMPLOYEE" }, profile });
    expect(membership.OR).toEqual([{ permissions: { has: "BOOKING_MODIFY" } }, ...(profile === "CASHIER" ? [] : [{ permissions: { isEmpty: true } }])]);
  });
  it.each(["STAFF", "MANAGER"] as const)("preserves %s empty-array defaults", async profile => {
    mocks.user.mockResolvedValue(employee(profile, [])); mocks.txUser.mockResolvedValue(employee(profile, [])); expect(await run()).toEqual({ success: true });
  });
  it.each(["missing-business", "missing-user", "foreign-owner", "platform-role", "cashier-default", "missing-permission"])("denies initial %s before transaction", async state => {
    if (state === "missing-business") mocks.business.mockResolvedValue(null); if (state === "missing-user") mocks.user.mockResolvedValue(null);
    if (state === "foreign-owner") mocks.user.mockResolvedValue({ ...owner(), owner: { id: 7, business_id: "foreign" } }); if (state === "platform-role") mocks.user.mockResolvedValue({ ...owner(), role: "PLATFORM_ADMIN" });
    if (state === "cashier-default") mocks.user.mockResolvedValue(employee("CASHIER", [])); if (state === "missing-permission") mocks.user.mockResolvedValue(employee("MANAGER", ["PAYMENT_COLLECT"]));
    expect(await run()).toEqual({ success: false, error: state === "missing-business" || state === "missing-user" ? "Unauthorized" : "Forbidden" }); expect(mocks.transaction).not.toHaveBeenCalled(); unchanged();
  });
  it.each(["business", "role", "removed", "transferred", "replaced"])("rechecks current owner %s before booking access", async revoked => {
    if (revoked === "business") mocks.txBusiness.mockResolvedValue({ ...business, id: "other" }); if (revoked === "role") mocks.txUser.mockResolvedValue({ ...owner(), role: "EMPLOYEE" });
    if (revoked === "removed") mocks.txUser.mockResolvedValue({ ...owner(), owner: null }); if (revoked === "transferred") mocks.txUser.mockResolvedValue({ ...owner(), owner: { id: 7, business_id: "foreign" } }); if (revoked === "replaced") mocks.txUser.mockResolvedValue({ ...owner(), owner: { id: 8, business_id: "biz-a" } });
    expect(await run()).toEqual({ success: false, error: "Forbidden" }); expect(mocks.booking).not.toHaveBeenCalled(); unchanged();
  });
  it.each(["role", "removed", "transferred", "replaced", "permission", "profile"])("rechecks current employee %s before booking access", async revoked => {
    mocks.user.mockResolvedValue(employee()); const row = employee();
    if (revoked === "role") row.role = "PLATFORM_ADMIN"; if (revoked === "transferred") row.employee.business_id = "foreign"; if (revoked === "replaced") row.employee.id = 10;
    if (revoked === "permission") row.employee.permissions = ["PAYMENT_COLLECT"]; if (revoked === "profile") { row.employee.profile = "CASHIER"; row.employee.permissions = []; }
    mocks.txUser.mockResolvedValue(revoked === "removed" ? { ...row, employee: null } : row);
    expect(await run()).toEqual({ success: false, error: "Forbidden" }); expect(mocks.booking).not.toHaveBeenCalled(); unchanged();
  });
  it("uses freshly permitted profile and policy instead of stale caller context", async () => {
    mocks.user.mockResolvedValue(employee()); mocks.txUser.mockResolvedValue(employee("STAFF")); mocks.txBusiness.mockResolvedValue({ ...business, manager_can_serve: true });
    expect(await run()).toEqual({ success: true }); expect(mocks.update.mock.calls[0][0].where.business).toMatchObject({ manager_can_serve: true, employees: { some: { profile: "STAFF" } } });
  });
  it("does not audit or retry a losing conditional snapshot", async () => {
    mocks.update.mockResolvedValue({ count: 0 }); expect(await run()).toEqual({ success: false, error: "Failed to update status" }); expect(booking.status).toBe("ACCEPTED");
    expect(mocks.update).toHaveBeenCalledOnce(); expect(mocks.transaction).toHaveBeenCalledOnce(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("rejects duplicate completion without another write or audit", async () => {
    expect(await run()).toEqual({ success: true }); expect((await run()).success).toBe(false); expect(mocks.update).toHaveBeenCalledOnce(); expect(mocks.audit).toHaveBeenCalledOnce(); expect(mocks.cache).toHaveBeenCalledOnce();
  });
  it.each(["auth", "actor", "tx-actor", "read", "write", "audit", "transaction"])("returns safe %s infrastructure failure without invalidation", async step => {
    const error = new Error("secret SQL/internal detail");
    if (step === "auth") mocks.auth.mockRejectedValue(error); if (step === "actor") mocks.user.mockRejectedValue(error); if (step === "tx-actor") mocks.txUser.mockRejectedValue(error);
    if (step === "read") mocks.booking.mockRejectedValue(error); if (step === "write") mocks.update.mockRejectedValue(error); if (step === "audit") mocks.audit.mockRejectedValue(error); if (step === "transaction") mocks.transaction.mockRejectedValue({ code: "P2034", message: error.message });
    expect(await run()).toEqual({ success: false, error: "Failed to update status" }); expect(booking.status).toBe("ACCEPTED"); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("does not report committed completion as failed when invalidation throws", async () => {
    mocks.cache.mockImplementation(() => { throw new Error("cache unavailable"); }); expect(await run()).toEqual({ success: true }); expect(booking.status).toBe("COMPLETED"); expect(mocks.audit).toHaveBeenCalledOnce(); expect(mocks.transaction).toHaveBeenCalledOnce();
  });
  it("protects direct command calls against stale capability context", async () => {
    const actor = await resolveTenantActorContext("tenant-a", "user-a"); if (!actor.success) throw new Error("Fixture actor missing"); mocks.txUser.mockResolvedValue({ ...owner(), role: "EMPLOYEE" });
    expect(await completeBookingManually(actor, 20)).toEqual({ success: false, error: "Forbidden" }); expect(mocks.booking).not.toHaveBeenCalled(); unchanged();
  });
});
