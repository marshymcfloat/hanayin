import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingStatus, StaffPermission, StaffProfile } from "@/prisma/generated/prisma/client";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), business: vi.fn(), user: vi.fn(), txBusiness: vi.fn(), txUser: vi.fn(), booking: vi.fn(), bookingUpdate: vi.fn(), legacyBookingUpdate: vi.fn(), customer: vi.fn(), customerUpdate: vi.fn(), legacyCustomerUpdate: vi.fn(), transaction: vi.fn(), audit: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/lib/services/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.business }, user: { findUnique: mocks.user }, booking: { findFirst: mocks.booking, update: mocks.legacyBookingUpdate }, $transaction: mocks.transaction } }));
import { markBookingNoShowAction } from "@/features/dashboard/actions/owner";
import { markBookingNoShow } from "@/features/bookings/services/booking-no-show";

const now = new Date("2030-01-15T09:00:00Z");
const business = { id: "biz-a", slug: "tenant-a", structure: "MANAGER_LED", allow_employee_self_booking: false, manager_can_serve: false };
const owner = () => ({ id: "user-a", role: "OWNER", owner: { id: 7, business_id: "biz-a" }, employee: null });
const employee = (profile: StaffProfile = "MANAGER", permissions: StaffPermission[] = ["BOOKING_MARK_NO_SHOW"]) => ({ id: "user-a", role: "EMPLOYEE", owner: null, employee: { id: 9, business_id: "biz-a", profile, permissions } });
let booking: { id: number; status: BookingStatus; customer_id: string | null; cancelled_at: Date | null; updated_at: Date; payment_status: string; amount_paid: number; _count: { availed_services: number } };
let customer: { id: string; no_show_count: number; trust_tier: string; last_no_show_at: Date | null; updated_at: Date };
const tx = { business: { findUnique: mocks.txBusiness }, user: { findUnique: mocks.txUser }, booking: { findFirst: mocks.booking, update: mocks.legacyBookingUpdate, updateMany: mocks.bookingUpdate }, customer: { findFirst: mocks.customer, update: mocks.legacyCustomerUpdate, updateMany: mocks.customerUpdate } };
function applyBooking(args: { data: Partial<typeof booking> }) { Object.assign(booking, args.data); return booking; }
function applyCustomer(args: { data: { no_show_count?: { increment: number }; last_no_show_at?: Date; trust_tier?: string } }) {
  if (args.data.no_show_count) customer.no_show_count += args.data.no_show_count.increment;
  if (args.data.last_no_show_at) customer.last_no_show_at = args.data.last_no_show_at;
  if (args.data.trust_tier) customer.trust_tier = args.data.trust_tier;
  return customer;
}

describe("no-show characterization and protected command", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    booking = { id: 20, status: "ACCEPTED", customer_id: "customer-a", cancelled_at: null, updated_at: now, payment_status: "UNPAID", amount_paid: 0, _count: { availed_services: 0 } };
    customer = { id: "customer-a", no_show_count: 0, trust_tier: "NEW", last_no_show_at: null, updated_at: now };
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant-a", session: { user: { id: "user-a", role: "OWNER" } } });
    mocks.business.mockResolvedValue(business); mocks.txBusiness.mockResolvedValue(business);
    mocks.user.mockResolvedValue(owner()); mocks.txUser.mockResolvedValue(owner());
    mocks.booking.mockImplementation(async () => ({ ...booking })); mocks.customer.mockImplementation(async () => ({ ...customer }));
    mocks.legacyBookingUpdate.mockImplementation(async args => applyBooking(args));
    mocks.legacyCustomerUpdate.mockImplementation(async args => applyCustomer(args));
    mocks.bookingUpdate.mockImplementation(async args => { applyBooking(args); return { count: 1 }; });
    mocks.customerUpdate.mockImplementation(async args => { applyCustomer(args); return { count: 1 }; });
    mocks.transaction.mockImplementation(async work => work(tx));
  });
  afterEach(() => vi.useRealTimers());
  it("marks first no-show without changing trust, payment or soft-cancel fields", async () => {
    expect(await markBookingNoShowAction(20)).toEqual({ success: true });
    expect(booking).toMatchObject({ status: "CANCELLED", cancelled_at: null, payment_status: "UNPAID", amount_paid: 0 });
    expect(customer).toMatchObject({ no_show_count: 1, trust_tier: "NEW", last_no_show_at: now });
    expect(mocks.auth).toHaveBeenCalledWith({ write: true }); expect(mocks.cache).toHaveBeenCalledWith("/app/tenant-a");
  });
  it("marks second no-show and restricts the linked customer at the original threshold", async () => {
    customer.no_show_count = 1; customer.trust_tier = "TRUSTED";
    expect(await markBookingNoShowAction(20)).toEqual({ success: true });
    expect(customer).toMatchObject({ no_show_count: 2, trust_tier: "RESTRICTED", last_no_show_at: now });
  });
  it("preserves anonymous walk-in and HOLD support without a customer write", async () => {
    booking.customer_id = null; booking.status = "HOLD";
    expect(await markBookingNoShowAction(20)).toEqual({ success: true }); expect(booking.status).toBe("CANCELLED");
    expect(customer.no_show_count).toBe(0); expect(mocks.legacyCustomerUpdate).not.toHaveBeenCalled(); expect(mocks.customerUpdate).not.toHaveBeenCalled();
  });
  it("preserves permitted manager no-show access without CREATE/MODIFY flags", async () => {
    mocks.user.mockResolvedValue(employee()); mocks.txUser.mockResolvedValue(employee());
    expect(await markBookingNoShowAction(20)).toEqual({ success: true }); expect(customer.no_show_count).toBe(1);
  });
  it("validates malformed/oversized IDs before auth and uses supported coercible numeric input", async () => {
    for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648, "bad", null, {}]) expect(await markBookingNoShowAction(value as number)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
    expect(await markBookingNoShowAction("20" as unknown as number)).toEqual({ success: true }); expect(mocks.booking.mock.calls[0][0].where.id).toBe(20);
  });
  it("preserves subscription auth denial and safe actor resolution errors", async () => {
    mocks.auth.mockResolvedValueOnce({ success: false, error: "Subscription expired" });
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Subscription expired" });
    mocks.business.mockResolvedValueOnce(null);
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Unauthorized" });
    mocks.user.mockResolvedValueOnce({ ...owner(), role: "PLATFORM_ADMIN" });
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Forbidden" });
    mocks.user.mockResolvedValueOnce(employee("CASHIER", ["PAYMENT_COLLECT"]));
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(["business", "role", "owner-removed", "owner-transferred", "owner-replaced"])("denies current %s revocation before target access", async revoked => {
    if (revoked === "business") mocks.txBusiness.mockResolvedValue(null);
    if (revoked === "role") mocks.txUser.mockResolvedValue({ ...owner(), role: "EMPLOYEE" });
    if (revoked === "owner-removed") mocks.txUser.mockResolvedValue({ ...owner(), owner: null });
    if (revoked === "owner-transferred") mocks.txUser.mockResolvedValue({ ...owner(), owner: { id: 7, business_id: "foreign" } });
    if (revoked === "owner-replaced") mocks.txUser.mockResolvedValue({ ...owner(), owner: { id: 8, business_id: "biz-a" } });
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.txBusiness).toHaveBeenCalledOnce(); expect(mocks.txUser).toHaveBeenCalledOnce();
    expect(mocks.booking).not.toHaveBeenCalled(); expect(mocks.customerUpdate).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(["role", "removed", "transferred", "replaced", "permission", "profile", "business"])("rechecks employee %s with the current stored resolver", async revoked => {
    mocks.user.mockResolvedValue(employee()); let row = employee();
    if (revoked === "role") row = { ...row, role: "OWNER" };
    if (revoked === "removed") mocks.txUser.mockResolvedValue({ ...row, employee: null });
    else {
      if (revoked === "transferred") row.employee.business_id = "foreign";
      if (revoked === "replaced") row.employee.id = 10;
      if (revoked === "permission") row.employee.permissions = ["PAYMENT_COLLECT"];
      if (revoked === "profile") { row.employee.profile = "CASHIER"; row.employee.permissions = []; }
      mocks.txUser.mockResolvedValue(row);
    }
    if (revoked === "business") mocks.txBusiness.mockResolvedValue({ ...business, id: "other-business" });
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.booking).not.toHaveBeenCalled(); expect(mocks.bookingUpdate).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each(["STAFF", "MANAGER"] as const)("preserves %s empty-array defaults and does not introduce unrelated business policy gates", async profile => {
    mocks.user.mockResolvedValue(employee(profile, [])); mocks.txUser.mockResolvedValue(employee(profile, []));
    expect(await markBookingNoShowAction(20)).toEqual({ success: true });
    const membership = mocks.bookingUpdate.mock.calls[0][0].where.business.employees.some;
    expect(membership).toEqual({ id: 9, user_id: "user-a", business_id: "biz-a", user: { role: "EMPLOYEE" }, profile, OR: [{ permissions: { has: "BOOKING_MARK_NO_SHOW" } }, { permissions: { isEmpty: true } }] });
  });
  it("preserves explicitly permitted cashier access without granting the empty-array default", async () => {
    mocks.user.mockResolvedValue(employee("CASHIER")); mocks.txUser.mockResolvedValue(employee("CASHIER"));
    expect(await markBookingNoShowAction(20)).toEqual({ success: true });
    expect(mocks.bookingUpdate.mock.calls[0][0].where.business.employees.some.OR).toEqual([{ permissions: { has: "BOOKING_MARK_NO_SHOW" } }]);
  });
  it("uses the current permitted profile and business-policy snapshot rather than trusting stale context", async () => {
    mocks.user.mockResolvedValue(employee()); mocks.txUser.mockResolvedValue(employee("STAFF")); mocks.txBusiness.mockResolvedValue({ ...business, manager_can_serve: true });
    expect(await markBookingNoShowAction(20)).toEqual({ success: true });
    expect(mocks.bookingUpdate.mock.calls[0][0].where.business).toMatchObject({ manager_can_serve: true, employees: { some: { profile: "STAFF" } } });
  });
  it("repeats verified tenant/reference/membership and exact parent/customer snapshots on conditional writes", async () => {
    expect(await markBookingNoShowAction(20)).toEqual({ success: true });
    const access = { id: "biz-a", slug: "tenant-a", structure: "MANAGER_LED", allow_employee_self_booking: false, manager_can_serve: false, owners: { some: { id: 7, user_id: "user-a", business_id: "biz-a", user: { role: "OWNER" } } } };
    const work = { OR: [{ status: { in: ["SERVING", "COMPLETED"] } }, { served_at: { not: null } }, { completed_at: { not: null } }, { paid_in_payslip_id: { not: null } }] };
    const scope = { business_id: "biz-a", business: access, OR: [{ customer_id: null }, { customer: { business_id: "biz-a" } }] };
    expect(mocks.booking.mock.calls[0][0]).toEqual({ where: { id: 20, ...scope }, select: { id: true, status: true, customer_id: true, cancelled_at: true, updated_at: true, _count: { select: { availed_services: { where: work } } } } });
    expect(mocks.bookingUpdate.mock.calls[0][0]).toEqual({ where: { ...scope, id: 20, status: "ACCEPTED", customer_id: "customer-a", cancelled_at: null, updated_at: now, availed_services: { none: work } }, data: { status: "CANCELLED" } });
    expect(mocks.customer).toHaveBeenCalledWith({ where: { id: "customer-a", business_id: "biz-a", business: access }, select: { id: true, no_show_count: true, trust_tier: true, last_no_show_at: true, updated_at: true } });
    expect(mocks.customerUpdate).toHaveBeenCalledWith({ where: { id: "customer-a", business_id: "biz-a", business: access, no_show_count: 0, trust_tier: "NEW", last_no_show_at: null, updated_at: now, bookings: { some: { id: 20, business_id: "biz-a", customer_id: "customer-a", status: "CANCELLED", cancelled_at: null } } }, data: { no_show_count: { increment: 1 }, trust_tier: "NEW", last_no_show_at: now } });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(mocks.legacyBookingUpdate).not.toHaveBeenCalled(); expect(mocks.legacyCustomerUpdate).not.toHaveBeenCalled();
    expect(mocks.business).toHaveBeenCalledOnce(); expect(mocks.user).toHaveBeenCalledOnce();
    expect(mocks.txBusiness).toHaveBeenCalledOnce(); expect(mocks.txUser).toHaveBeenCalledOnce();
  });
  it("records verified customer and booking audits without contact data before cache invalidation", async () => {
    customer.no_show_count = 1;
    expect(await markBookingNoShowAction(20)).toEqual({ success: true });
    expect(mocks.audit.mock.calls).toEqual([
      [tx, { actorId: "user-a", businessId: "biz-a", entityType: "Customer", entityId: "customer-a", action: "UPDATED", changes: { before: { no_show_count: 1, trust_tier: "NEW", last_no_show_at: null }, after: { no_show_count: 2, trust_tier: "RESTRICTED", last_no_show_at: now, bookingId: 20, mode: "BOOKING_NO_SHOW" } } }],
      [tx, { actorId: "user-a", businessId: "biz-a", entityType: "Booking", entityId: "20", action: "STATUS_CHANGED", changes: { before: { status: "ACCEPTED" }, after: { status: "CANCELLED", mode: "BOOKING_NO_SHOW" } } }],
    ]);
    expect(mocks.customerUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]);
    expect(mocks.audit.mock.invocationCallOrder[1]).toBeLessThan(mocks.cache.mock.invocationCallOrder[0]);
  });
  it("preserves anonymous no-show while auditing the parent in the same transaction", async () => {
    booking.customer_id = null;
    expect(await markBookingNoShowAction(20)).toEqual({ success: true });
    expect(mocks.customer).not.toHaveBeenCalled(); expect(mocks.customerUpdate).not.toHaveBeenCalled(); expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.audit.mock.calls[0][1].entityType).toBe("Booking");
  });
  it.each(["NEW", "TRUSTED", "RESTRICTED"])("retains first-no-show %s trust and restrictions at later counts", async tier => {
    customer.trust_tier = tier;
    expect(await markBookingNoShowAction(20)).toEqual({ success: true }); expect(customer.trust_tier).toBe(tier);
    booking.status = "HOLD"; customer.no_show_count = 4;
    expect(await markBookingNoShowAction(20)).toEqual({ success: true }); expect(customer.no_show_count).toBe(5); expect(customer.trust_tier).toBe("RESTRICTED");
  });
  it.each(["PARTIALLY_PAID", "PAID"])("preserves %s no-show behavior without changing received money", async status => {
    booking.payment_status = status; booking.amount_paid = 100;
    expect(await markBookingNoShowAction(20)).toEqual({ success: true });
    expect(booking).toMatchObject({ status: "CANCELLED", payment_status: status, amount_paid: 100 });
    expect(Object.keys(mocks.bookingUpdate.mock.calls[0][0].data)).toEqual(["status"]);
  });
  it("denies missing/foreign/reference-denied parents without leaking existence", async () => {
    mocks.booking.mockResolvedValue(null);
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Booking not found." });
    expect(mocks.bookingUpdate).not.toHaveBeenCalled(); expect(mocks.customer).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it.each(["CANCELLED", "COMPLETED", "soft-cancelled", "unsupported", "accounted-work"])("denies %s parent/work state before any write", async state => {
    if (state === "CANCELLED" || state === "COMPLETED") booking.status = state;
    if (state === "soft-cancelled") booking.cancelled_at = now;
    if (state === "unsupported") booking.status = "INVALID" as BookingStatus;
    if (state === "accounted-work") booking._count.availed_services = 1;
    const error = state === "CANCELLED" || state === "soft-cancelled" ? "Booking is already cancelled." : state === "COMPLETED" ? "Cannot mark a completed booking as no-show." : "Failed to mark as no-show.";
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error });
    expect(mocks.customer).not.toHaveBeenCalled(); expect(mocks.bookingUpdate).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each([null, -1, 1.5, 2147483647])("denies missing or invalid customer counter %j before parent mutation", async count => {
    if (count === null) mocks.customer.mockResolvedValue(null); else customer.no_show_count = count;
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Failed to mark as no-show." });
    expect(mocks.bookingUpdate).not.toHaveBeenCalled(); expect(mocks.customerUpdate).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects a repeated completed no-show without a second counter/audit/cache write", async () => {
    expect(await markBookingNoShowAction(20)).toEqual({ success: true });
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Booking is already cancelled." });
    expect(customer.no_show_count).toBe(1); expect(mocks.customerUpdate).toHaveBeenCalledOnce(); expect(mocks.audit).toHaveBeenCalledTimes(2); expect(mocks.cache).toHaveBeenCalledOnce();
  });
  it.each(["parent", "customer"])("propagates %s conditional losses as rollback-producing errors, not committed success", async lost => {
    (lost === "parent" ? mocks.bookingUpdate : mocks.customerUpdate).mockResolvedValue({ count: 0 });
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Failed to mark as no-show." });
    expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
    if (lost === "parent") expect(mocks.customerUpdate).not.toHaveBeenCalled();
  });
  it.each(["auth", "business", "user", "txBusiness", "txUser", "booking", "customer", "bookingUpdate", "customerUpdate", "transaction", "audit"] as const)("maps private %s infrastructure failures safely", async operation => {
    mocks[operation].mockRejectedValueOnce(new Error("SQL/private-secret"));
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Failed to mark as no-show." }); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("does not commit on second audit failure or serialization/missing/null errors", async () => {
    mocks.audit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Private booking audit"));
    expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Failed to mark as no-show." }); expect(mocks.cache).not.toHaveBeenCalled();
    for (const reason of [{ code: "P2034" }, { code: "P2025" }, null]) {
      mocks.transaction.mockRejectedValueOnce(reason);
      expect(await markBookingNoShowAction(20)).toEqual({ success: false, error: "Failed to mark as no-show." });
    }
  });
  it("preserves committed success when post-commit cache work throws", async () => {
    mocks.cache.mockImplementation(() => { throw new Error("Private cache"); });
    expect(await markBookingNoShowAction(20)).toEqual({ success: true }); expect(customer.no_show_count).toBe(1); expect(mocks.audit).toHaveBeenCalledTimes(2);
  });
  it("rejects mismatched actor kind and role at the domain boundary", async () => {
    const context = { success: true, businessId: "biz-a", businessSlug: "tenant-a", userId: "user-a", actorType: "EMPLOYEE", role: "PLATFORM_ADMIN", ownerId: null, employeeId: 9, profile: "MANAGER", permissions: ["BOOKING_MARK_NO_SHOW"], businessPolicy: { structure: "MANAGER_LED", allowEmployeeSelfBooking: false, managerCanServe: false } };
    expect(await markBookingNoShow(context as Parameters<typeof markBookingNoShow>[0], 20)).toEqual({ success: false, error: "Forbidden" }); expect(mocks.booking).not.toHaveBeenCalled();
  });
});
