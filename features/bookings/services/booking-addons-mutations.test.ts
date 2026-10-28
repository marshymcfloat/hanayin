import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingAddOnActor } from "@/features/bookings/booking-addon-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { BookingPersistenceTransactionHooks } from "./booking-persistence";
const mocks = vi.hoisted(() => ({ tx: vi.fn(), booking: vi.fn(), parent: vi.fn(), update: vi.fn(), customer: vi.fn(), service: vi.fn(), packages: vi.fn(), lines: vi.fn(), audit: vi.fn(), publish: vi.fn(), pricing: vi.fn(), slot: vi.fn(), access: vi.fn(), persist: vi.fn(), state: { rows: 0, audits: 0 } }));
vi.mock("@/prisma/prisma", () => ({ prisma: { $transaction: mocks.tx, booking: { findFirst: mocks.parent } } }));
vi.mock("@/features/bookings/booking-addon-access", () => ({ recheckBookingAddOnAccess: mocks.access }));
vi.mock("@/features/bookings/services/booking-pricing", () => ({ buildBookingPricingSnapshot: mocks.pricing }));
vi.mock("@/features/bookings/services/booking-availability", () => ({ checkSaleEventSlotLimit: mocks.slot }));
vi.mock("@/features/bookings/services/booking-persistence", () => ({ createBookingInDb: mocks.persist }));
vi.mock("@/lib/services/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/services/outbox", () => ({ publishEvent: mocks.publish }));
vi.mock("@/lib/date-utils", () => ({ getCurrentDateTimePH: () => new Date("2030-01-15T02:00:00Z") }));
import { appendServicesToUntouchedBooking, appendServicesToUntouchedBookingInTx, createFollowUpAddOnBooking, BookingAddOnStateRaceError } from "./booking-addons";

const actor: BookingAddOnActor = { success: true, businessId: "biz", businessSlug: "demo", userId: "user", actorType: "OWNER", role: "OWNER", ownerId: 5, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
const params = { bookingId: 1, actorContext: actor, services: [{ id: 2, quantity: 2, packageId: 3, claimedByCurrentEmployee: true }], currentEmployeeId: 11 };
const tx = { booking: { findFirst: mocks.booking, update: mocks.update }, customer: { findFirst: mocks.customer }, service: { findMany: mocks.service }, servicePackage: { findMany: mocks.packages }, availedService: { createMany: mocks.lines } } as unknown as Prisma.TransactionClient;
function booking(overrides = {}) {
  return { id: 1, business_id: "biz", customer_id: "customer", status: "ACCEPTED", amount_paid: 0, payment_status: "UNPAID", payment_method: "CASH", grand_total: 100, total_discount: 0, scheduled_at: new Date("2030-01-15T02:00:00Z"), estimated_end: new Date("2030-01-15T02:30:00Z"), availed_services: [{ id: 1, service_id: 2, package_id: 3, status: "PENDING", scheduled_at: new Date("2030-01-15T02:00:00Z"), estimated_end: new Date("2030-01-15T02:30:00Z"), final_price: 100 }], ...overrides };
}
const parent = { id: 1, business_id: "biz", customer_id: "customer", customer: { id: "customer", business_id: "biz", name: "Test", email: null, phone: null } };
describe("atomic add-on mutations", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.state.rows = 0; mocks.state.audits = 0;
    mocks.tx.mockImplementation(async (work) => { const before = { ...mocks.state }; try { return await work(tx); } catch (error) { Object.assign(mocks.state, before); throw error; } });
    mocks.access.mockResolvedValue(actor); mocks.booking.mockResolvedValue(booking()); mocks.parent.mockResolvedValue(parent); mocks.customer.mockResolvedValue({ id: "customer" });
    mocks.service.mockResolvedValue([{ id: 2 }]); mocks.packages.mockResolvedValue([{ id: 3 }]);
    mocks.lines.mockImplementation(async ({ data }) => { mocks.state.rows += data.length; return { count: data.length }; });
    mocks.audit.mockImplementation(async () => { mocks.state.audits += 1; });
    mocks.pricing.mockResolvedValue({ services: [{ id: 2, packageId: 3, originalPrice: 100, estimatedCost: 20, discount: 10, price: 90, commissionBase: 70, duration: 30 }], appliedSaleEventId: null });
    mocks.persist.mockImplementation(async (_input, hooks: BookingPersistenceTransactionHooks) => {
      const before = { ...mocks.state }; try {
        await hooks.beforeCreate?.(tx); mocks.state.rows += 1; await mocks.publish(tx, { aggregateId: "4" });
        await hooks.afterCreate?.(tx, { id: 4 }); return { id: 4 };
      } catch (error) { Object.assign(mocks.state, before); throw error; }
    });
  });
  it("appends expanded claimed lines, total, verified audit and outbox in one bounded transaction", async () => {
    await expect(appendServicesToUntouchedBooking(params)).resolves.toEqual({ bookingId: 1 });
    expect(mocks.tx).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(mocks.access).toHaveBeenCalledWith(tx, actor, 11);
    expect(mocks.lines.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ booking_id: 1, service_id: 2, package_id: 3, final_price: 90, served_by_id: 11, status: "CLAIMED", scheduled_at: new Date("2030-01-15T02:30:00Z"), estimated_end: new Date("2030-01-15T03:00:00Z") }),
      expect.objectContaining({ scheduled_at: new Date("2030-01-15T03:00:00Z"), estimated_end: new Date("2030-01-15T03:30:00Z") }),
    ]);
    expect(mocks.pricing).toHaveBeenCalledWith(expect.objectContaining({ db: tx, services: [{ id: 2, quantity: 3, packageId: 3 }] }));
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 1, business_id: "biz" }, data: { grand_total: 280, estimated_end: new Date("2030-01-15T03:30:00Z") } });
    expect(mocks.audit).toHaveBeenCalledWith(tx, expect.objectContaining({ actorId: "user", businessId: "biz", entityId: "1" }));
    expect(mocks.publish).toHaveBeenCalledWith(tx, expect.objectContaining({ aggregateId: "1", businessId: "biz" }));
  });
  it("preserves outer transaction injection without opening another transaction", async () => {
    await appendServicesToUntouchedBookingInTx(tx, params);
    expect(mocks.tx).not.toHaveBeenCalled(); expect(mocks.access).toHaveBeenCalledWith(tx, actor, 11);
  });
  it.each(["update", "audit", "publish"] as const)("rolls back actual staged append lines when %s fails", async (stage) => {
    mocks[stage].mockRejectedValue(new Error("failed"));
    await expect(appendServicesToUntouchedBooking(params)).rejects.toThrow("failed");
    expect(mocks.lines).toHaveBeenCalledTimes(1); expect(mocks.state.rows).toBe(0); expect(mocks.state.audits).toBe(0);
  });
  it("denies current actor before booking reads or writes", async () => {
    mocks.access.mockRejectedValue(new Error("Forbidden"));
    await expect(appendServicesToUntouchedBooking(params)).rejects.toThrow("Forbidden");
    expect(mocks.booking).not.toHaveBeenCalled(); expect(mocks.lines).not.toHaveBeenCalled();
  });
  it("denies missing/foreign parent without a state-race marker", async () => {
    mocks.booking.mockResolvedValue(null);
    await expect(appendServicesToUntouchedBooking(params)).rejects.toThrow("Booking not found");
    expect(mocks.booking).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1, business_id: "biz", business: { slug: "demo" } } }));
  });
  it.each([{ status: "COMPLETED" }, { amount_paid: 1 }, { payment_status: "PAID" }, { availed_services: [{ service_id: 2, package_id: 3, status: "CLAIMED" }] }])("marks only valid parent changed state as a fallback race", async (snapshot) => {
    mocks.booking.mockResolvedValue(booking(snapshot));
    await expect(appendServicesToUntouchedBooking(params)).rejects.toBeInstanceOf(BookingAddOnStateRaceError);
    expect(mocks.lines).not.toHaveBeenCalled();
  });
  it.each(["customer", "service", "packages"] as const)("rejects foreign/missing %s references before append", async (stage) => {
    mocks[stage].mockResolvedValue(stage === "customer" ? null : []);
    await expect(appendServicesToUntouchedBooking(params)).rejects.toThrow(); expect(mocks.lines).not.toHaveBeenCalled();
  });
  it("checks same-tenant existing service rows as well as new selections", async () => {
    mocks.booking.mockResolvedValue(booking({ availed_services: [{ service_id: 9, package_id: null, status: "PENDING" }] }));
    await expect(appendServicesToUntouchedBooking(params)).rejects.toThrow("One or more selected services are invalid");
    expect(mocks.service).toHaveBeenCalledWith({ where: { id: { in: [2, 9] }, business_id: "biz" }, select: { id: true } });
  });
  it("checks sale-event limit through same transaction", async () => {
    const pricing = await mocks.pricing(); mocks.pricing.mockResolvedValue({ ...pricing, appliedSaleEventId: 7 });
    await appendServicesToUntouchedBooking(params); expect(mocks.slot).toHaveBeenCalledWith({ saleEventId: 7, db: tx });
  });
  it("uses pending lines and default duration when not claimed", async () => {
    mocks.pricing.mockResolvedValue({ services: [{ id: 2, packageId: 3, price: 100, originalPrice: 100, duration: 0, discount: 0, commissionBase: 0 }], appliedSaleEventId: null });
    await appendServicesToUntouchedBooking({ ...params, services: [{ id: 2, packageId: 3, quantity: 1 }], currentEmployeeId: undefined });
    expect(mocks.lines.mock.calls[0][0].data[0]).toMatchObject({ status: "PENDING", claimed_at: null, served_by_id: null, served_by_type: null, commission_base: 100, discount_reason: null, estimated_end: new Date("2030-01-15T03:00:00Z") });
  });
  it("appends unpackaged lines to unscheduled anonymous booking without customer or package reads", async () => {
    mocks.booking.mockResolvedValue(booking({ customer_id: null, scheduled_at: null, payment_method: "ONLINE", availed_services: [] }));
    mocks.pricing.mockResolvedValue({ services: [{ id: 2, originalPrice: 100, price: 80, estimatedCost: 20, duration: 15, discount: 20, discountReason: "SALE_EVENT", commissionBase: 80 }], appliedSaleEventId: null });
    await appendServicesToUntouchedBooking({ ...params, services: [{ id: 2, quantity: 1 }], currentEmployeeId: undefined });
    expect(mocks.customer).not.toHaveBeenCalled(); expect(mocks.packages).not.toHaveBeenCalled();
    expect(mocks.pricing).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: new Date("2030-01-15T02:00:00Z"), paymentMethod: "ONLINE", services: [{ id: 2, quantity: 1, packageId: undefined }] }));
    expect(mocks.lines.mock.calls[0][0].data).toEqual([expect.objectContaining({ package_id: null, discount_reason: "SALE_EVENT", status: "PENDING", scheduled_at: new Date("2030-01-15T02:00:00Z"), estimated_end: new Date("2030-01-15T02:15:00Z") })]);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 1, business_id: "biz" }, data: { grand_total: 180, estimated_end: new Date("2030-01-15T02:15:00Z") } });
  });
  it("aggregates repeated existing lines and adds a different service with missing prior timestamps", async () => {
    mocks.booking.mockResolvedValue(booking({ availed_services: [
      { service_id: 2, package_id: 3, status: "PENDING", estimated_end: null, scheduled_at: null },
      { service_id: 2, package_id: 3, status: "PENDING", estimated_end: null, scheduled_at: new Date("2030-01-15T02:00:00Z") },
    ] }));
    mocks.service.mockResolvedValue([{ id: 2 }, { id: 5 }]);
    mocks.pricing.mockResolvedValue({ services: [{ id: 2, packageId: 3, price: 100, duration: 30 }, { id: 5, price: 75, originalPrice: 75, duration: 30, discount: 0, commissionBase: 75 }], appliedSaleEventId: null });
    await appendServicesToUntouchedBooking({ ...params, services: [{ id: 5, quantity: 1 }], currentEmployeeId: undefined });
    expect(mocks.pricing).toHaveBeenCalledWith(expect.objectContaining({ services: [{ id: 2, quantity: 2, packageId: 3 }, { id: 5, quantity: 1, packageId: undefined }] }));
    expect(mocks.lines.mock.calls[0][0].data[0]).toMatchObject({ service_id: 5, package_id: null, scheduled_at: new Date("2030-01-15T02:00:00Z"), estimated_end: new Date("2030-01-15T02:30:00Z") });
  });
  it("rejects missing canonical selected pricing before append", async () => {
    mocks.pricing.mockResolvedValue({ services: [], appliedSaleEventId: null });
    await expect(appendServicesToUntouchedBooking(params)).rejects.toThrow("Unable to resolve canonical pricing"); expect(mocks.lines).not.toHaveBeenCalled();
  });
  it("inherits parent profile and writes both audit links inside booking persistence hooks", async () => {
    await expect(createFollowUpAddOnBooking({ ...params, staffSelectionMode: "REQUIRE_SELECTED" })).resolves.toEqual({ bookingId: 4, parentBookingId: 1 });
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ customerId: "customer", customerName: "Test", employeeId: 11, paymentMethod: "CASH", paymentType: "FULL", isPublicBooking: false, isWalkIn: true, staffSelectionMode: "REQUIRE_SELECTED", services: [expect.objectContaining({ id: 2, quantity: 1 }), expect.objectContaining({ id: 2, quantity: 1 })] }), expect.objectContaining({ beforeCreate: expect.any(Function), afterCreate: expect.any(Function) }));
    expect(mocks.audit).toHaveBeenNthCalledWith(1, tx, expect.objectContaining({ entityId: "1", changes: { before: { mode: "FOLLOW_UP_PENDING" }, after: { mode: "FOLLOW_UP_CREATED", followUpBookingId: 4 } } }));
    expect(mocks.audit).toHaveBeenNthCalledWith(2, tx, expect.objectContaining({ entityId: "4", action: "CREATED", changes: { after: { mode: "FOLLOW_UP_CREATED", parentBookingId: 1 } } }));
    expect(mocks.tx).not.toHaveBeenCalled(); expect(mocks.state.rows).toBe(1);
  });
  it("inherits nonempty contact fields and defaults optional staff-selection mode", async () => {
    mocks.parent.mockResolvedValue({ ...parent, customer: { ...parent.customer, email: "fixture@example.test", phone: "639170000003" } });
    await createFollowUpAddOnBooking(params);
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ email: "fixture@example.test", phone: "639170000003", staffSelectionMode: "ANY_AVAILABLE" }), expect.any(Object));
    expect(mocks.booking).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ customer: { id: "customer", business_id: "biz", name: "Test", email: "fixture@example.test", phone: "639170000003" } }) }));
  });
  it("denies inconsistent same-tenant customer ID before follow-up persistence", async () => {
    mocks.parent.mockResolvedValue({ ...parent, customer: { ...parent.customer, id: "different" } });
    await expect(createFollowUpAddOnBooking(params)).rejects.toThrow("Customer not found");
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it.each([1, 2])("rolls back staged follow-up booking/outbox when audit %i fails", async (auditNumber) => {
    if (auditNumber === 2) mocks.audit.mockResolvedValueOnce(undefined);
    mocks.audit.mockRejectedValueOnce(new Error("audit failed"));
    await expect(createFollowUpAddOnBooking(params)).rejects.toThrow("audit failed");
    expect(mocks.publish).toHaveBeenCalledTimes(1); expect(mocks.state.rows).toBe(0); expect(mocks.state.audits).toBe(0);
  });
  it.each([null, { ...parent, customer: null }, { ...parent, customer: { ...parent.customer, business_id: "foreign" } }])("rejects missing, anonymous or foreign-customer parent", async (snapshot) => {
    mocks.parent.mockResolvedValue(snapshot); await expect(createFollowUpAddOnBooking(params)).rejects.toThrow(); expect(mocks.persist).not.toHaveBeenCalled();
  });
  it("rechecks parent/customer snapshot, references and actor before follow-up writes", async () => {
    mocks.booking.mockResolvedValue(null);
    await expect(createFollowUpAddOnBooking(params)).rejects.toThrow("Booking customer changed");
    expect(mocks.booking).toHaveBeenCalledWith({ where: { id: 1, business_id: "biz", business: { slug: "demo" }, customer_id: "customer", customer: { id: "customer", business_id: "biz", name: "Test", email: null, phone: null } }, select: { id: true } });
    expect(mocks.publish).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each(["access", "service", "packages"] as const)("denies stale/foreign %s before follow-up insertion", async (stage) => {
    if (stage === "access") mocks.access.mockRejectedValue(new Error("Forbidden")); else mocks[stage].mockResolvedValue([]);
    await expect(createFollowUpAddOnBooking(params)).rejects.toThrow(); expect(mocks.publish).not.toHaveBeenCalled(); expect(mocks.state.rows).toBe(0);
  });
  it.each([appendServicesToUntouchedBooking, createFollowUpAddOnBooking])("rejects oversized input at direct service boundary", async (mutation) => {
    await expect(mutation({ ...params, services: [{ id: 2, quantity: 11 }] })).rejects.toThrow("Invalid input"); expect(mocks.access).not.toHaveBeenCalled();
  });
});
