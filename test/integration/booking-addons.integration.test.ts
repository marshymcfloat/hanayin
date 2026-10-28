import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import type { BookingAddOnActor } from "@/features/bookings/booking-addon-access";
import { appendServicesToUntouchedBooking, createFollowUpAddOnBooking, BookingAddOnStateRaceError } from "@/features/bookings/services/booking-addons";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { Role, StaffProfile, StaffPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

// Real PostgreSQL persistence/audit/outbox; pricing and availability are deterministic stubs.
const controls = vi.hoisted(() => ({ businessId: "", failAuditNumber: 0, auditWrites: 0, reachedFailure: false, outboxBeforeFailure: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/bookings/services/booking-pricing", () => ({
  buildBookingPricingSnapshot: vi.fn(async (input: {
    businessSlug: string; scheduledAt: Date;
    services: Array<{ id: number; quantity: number; packageId?: number; claimedByCurrentEmployee?: boolean }>;
  }) => {
    const duration = input.services.reduce((sum, service) => sum + service.quantity * 30, 0);
    return {
      business: { id: controls.businessId, slug: input.businessSlug, name: "Fixture", commission_calculation_basis: "DISCOUNTED_PRICE" },
      services: input.services.map(service => ({ ...service, name: "Fixture", duration: 30, price: 100, originalPrice: 100, estimatedCost: 20, discount: 0, discountReason: null, saleEventId: null, commissionBase: 100 })),
      subtotal: duration / 30 * 100, grandTotal: duration / 30 * 100, voucherDiscount: 0,
      appliedSaleEventId: null, downpaymentAmount: null, voucher: null,
      estimatedEnd: new Date(input.scheduledAt.getTime() + duration * 60_000),
    };
  }),
}));
vi.mock("@/features/bookings/services/booking-availability", async original => ({
  ...await original<typeof import("@/features/bookings/services/booking-availability")>(),
  validateBookingOrThrow: vi.fn().mockResolvedValue(undefined),
  resolveStaffSelectionOrThrow: vi.fn().mockResolvedValue({ assignedEmployeeId: null }),
  checkSaleEventSlotLimit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, {
    get(client, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) =>
        client.$transaction(tx => work(new Proxy(tx, {
          get(transaction, member) {
            const delegate = Reflect.get(transaction, member);
            if (member !== "auditLog") return delegate;
            return new Proxy(delegate, {
              get(model, operation) {
                const value = Reflect.get(model, operation);
                if (typeof value !== "function") return value;
                return async (...args: unknown[]) => {
                  const result = await value.apply(model, args);
                  if (operation === "create") {
                    controls.auditWrites++;
                    if (controls.failAuditNumber === controls.auditWrites) {
                      controls.reachedFailure = true;
                      controls.outboxBeforeFailure = await tx.outboxMessage.count({ where: { business_id: controls.businessId } }) > 0;
                      throw new Error("Fixture post-audit-write failure");
                    }
                  }
                  return result;
                };
              },
            });
          },
        })), options);
      const value = Reflect.get(client, key);
      return typeof value === "function" ? value.bind(client) : value;
    },
  }) };
});
requireTestDatabase();

const factory = createSharedWorkflowFactory({ namespace: `integration-booking-addons-${randomUUID()}` });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const user = factory.user({ contactNumber: `test-addon-owner-${randomUUID()}` });
const staffUser = factory.user({ id: `${user.id}-staff`, role: "EMPLOYEE", contactNumber: `test-addon-staff-${randomUUID()}` });
const tenantIds = [business.id, foreign.id];
let owner: BookingAddOnActor;
let staff: BookingAddOnActor;
let parentId: number;
let foreignParentId: number;
let serviceId: number;
let foreignServiceId: number;
let packageId: number;
let foreignPackageId: number;
const date = new Date("2030-01-15T09:00:00Z");
const params = (context = owner) => ({ bookingId: parentId, actorContext: context, services: [{ id: serviceId, quantity: 2, packageId }] });
const ownGraph = () => prisma.booking.findUniqueOrThrow({ where: { id: parentId }, include: { availed_services: { orderBy: { id: "asc" } } } });
const countEvidence = async () => ({
  bookings: await prisma.booking.count({ where: { business_id: business.id } }),
  audits: await prisma.auditLog.count({ where: { business_id: business.id } }),
  outbox: await prisma.outboxMessage.count({ where: { business_id: business.id } }),
});

describe("atomic tenant booking add-ons in PostgreSQL", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(date);
    controls.businessId = business.id;
    for (const fixture of [business, foreign]) await prisma.business.create({ data: { id: fixture.id, slug: fixture.slug, name: fixture.name, initials: fixture.initials } });
    for (const fixture of [user, staffUser]) await prisma.user.create({ data: { id: fixture.id, contact_number: fixture.contactNumber, name: fixture.name, hashed_password: fixture.hashedPassword, role: fixture.role } });
    const membership = await prisma.owner.create({ data: { user_id: user.id, business_id: business.id } });
    const employee = await prisma.employee.create({ data: { user_id: staffUser.id, business_id: business.id, salary: 0, profile: StaffProfile.STAFF } });
    const policy = { structure: "OWNER_EMPLOYEE_SELF_SERVICE" as const, allowEmployeeSelfBooking: true, managerCanServe: true };
    owner = { success: true, actorType: "OWNER", role: Role.OWNER, ownerId: membership.id, userId: user.id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy: policy };
    staff = { ...owner, actorType: "EMPLOYEE", role: Role.EMPLOYEE, ownerId: null, employeeId: employee.id, userId: staffUser.id, profile: StaffProfile.STAFF, permissions: [StaffPermission.BOOKING_MODIFY] };
  });
  beforeEach(async () => {
    controls.failAuditNumber = 0; controls.auditWrites = 0; controls.reachedFailure = false; controls.outboxBeforeFailure = false;
    await prisma.auditLog.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.outboxMessage.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.booking.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.customer.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.servicePackage.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.service.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.user.update({ where: { id: user.id }, data: { role: Role.OWNER } });
    await prisma.user.update({ where: { id: staffUser.id }, data: { role: Role.EMPLOYEE } });
    await prisma.owner.update({ where: { id: owner.ownerId! }, data: { business_id: business.id } });
    await prisma.employee.update({ where: { id: staff.employeeId! }, data: { business_id: business.id, permissions: [StaffPermission.BOOKING_MODIFY] } });
    for (const [index, tenantId] of tenantIds.entries()) {
      const customer = factory.customer({ id: `${business.id}-customer-${index}`, businessId: tenantId });
      await prisma.customer.create({ data: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, business_id: tenantId } });
      const fixtureService = factory.service({ businessId: tenantId, price: 100, duration: 30 });
      const service = await prisma.service.create({ data: { name: fixtureService.name, category: fixtureService.category, price: fixtureService.price, duration: fixtureService.duration, business_id: tenantId } });
      const pkg = await prisma.servicePackage.create({ data: { name: "Fixture package", category: "GENERAL", price: 100, business_id: tenantId } });
      const fixtureBooking = factory.booking({ businessId: tenantId, customerId: customer.id, scheduledAt: date, grandTotal: 100 });
      const booking = await prisma.booking.create({ data: {
        business_id: tenantId, customer_id: customer.id, status: fixtureBooking.status, payment_status: "UNPAID", amount_paid: 0, payment_method: "CASH", grand_total: 100, total_discount: 0, scheduled_at: date, estimated_end: new Date(date.getTime() + 30 * 60_000),
        availed_services: { create: { service_id: service.id, package_id: pkg.id, price: 100, final_price: 100, commission_base: 100, scheduled_at: date, estimated_end: new Date(date.getTime() + 30 * 60_000) } },
      } });
      if (index === 0) { parentId = booking.id; serviceId = service.id; packageId = pkg.id; }
      else { foreignParentId = booking.id; foreignServiceId = service.id; foreignPackageId = pkg.id; }
    }
  });
  afterAll(async () => {
    controls.failAuditNumber = 0;
    let failures = 0;
    try {
      for (const cleanup of [
        () => prisma.auditLog.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.outboxMessage.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.booking.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.business.deleteMany({ where: { id: { in: tenantIds } } }),
        () => prisma.user.deleteMany({ where: { id: { in: [user.id, staffUser.id] } } }),
      ]) { try { await cleanup(); } catch { failures++; } }
    } finally { try { await prisma.$disconnect(); } finally { vi.useRealTimers(); } }
    if (failures) throw new Error(`Fixture cleanup failed in ${failures} steps`);
  });

  it("commits append lines, totals, audit and outbox together", async () => {
    await expect(appendServicesToUntouchedBooking(params(staff))).resolves.toEqual({ bookingId: parentId });
    const graph = await ownGraph(); expect(graph.grand_total).toBe(300); expect(graph.availed_services).toHaveLength(3);
    expect(graph.availed_services.slice(1)).toEqual([expect.objectContaining({ service_id: serviceId, package_id: packageId, final_price: 100, status: "PENDING" }), expect.objectContaining({ service_id: serviceId, package_id: packageId, final_price: 100 })]);
    expect(await prisma.auditLog.findMany({ where: { business_id: business.id } })).toEqual([expect.objectContaining({ actor_id: staff.userId, business_id: business.id, entity_id: String(parentId), action: "UPDATED", changes: { before: { mode: "APPEND_ATTEMPT", grandTotal: 100, serviceCount: 1 }, after: { mode: "APPEND_SUCCESS", grandTotal: 300, addedServices: 2 } } })]);
    expect(await prisma.outboxMessage.findMany({ where: { business_id: business.id } })).toEqual([expect.objectContaining({ aggregate_id: String(parentId), event_type: "BOOKING_CREATED" })]);
  });
  it("rolls appended real lines/total/audit back after actual audit insertion failure", async () => {
    const prior = await ownGraph(); controls.failAuditNumber = 1;
    await expect(appendServicesToUntouchedBooking(params())).rejects.toThrow("Fixture post-audit-write failure");
    expect(controls.reachedFailure).toBe(true); expect(await ownGraph()).toEqual(prior);
    expect(await countEvidence()).toEqual({ bookings: 1, audits: 0, outbox: 0 });
  });
  it("commits follow-up booking, lines, outbox and both linked audits atomically", async () => {
    const result = await createFollowUpAddOnBooking(params()); expect(result.parentBookingId).toBe(parentId);
    const follow = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId }, include: { availed_services: true } });
    expect(follow).toMatchObject({ customer_id: `${business.id}-customer-0`, business_id: business.id, grand_total: 200, amount_paid: 200, payment_status: "PAID", payment_method: "CASH", status: "ACCEPTED" });
    expect(follow.availed_services).toHaveLength(2);
    expect(await countEvidence()).toEqual({ bookings: 2, audits: 2, outbox: 1 });
    const audits = await prisma.auditLog.findMany({ where: { business_id: business.id } });
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity_id: String(parentId), actor_id: user.id, changes: { before: { mode: "FOLLOW_UP_PENDING" }, after: { mode: "FOLLOW_UP_CREATED", followUpBookingId: result.bookingId } } }),
      expect.objectContaining({ entity_id: String(result.bookingId), actor_id: user.id, changes: { after: { mode: "FOLLOW_UP_CREATED", parentBookingId: parentId } } }),
    ]));
    expect(await prisma.outboxMessage.findMany({ where: { business_id: business.id } })).toEqual([expect.objectContaining({ aggregate_id: String(result.bookingId), event_type: "BOOKING_CREATED" })]);
  });
  it.each([1, 2])("rolls back real follow-up, lines, outbox and both audits after audit %i insert", async auditNumber => {
    const prior = await ownGraph(); controls.failAuditNumber = auditNumber;
    await expect(createFollowUpAddOnBooking(params())).rejects.toThrow("Fixture post-audit-write failure");
    expect(controls.reachedFailure).toBe(true); expect(controls.outboxBeforeFailure).toBe(true); expect(await ownGraph()).toEqual(prior);
    expect(await countEvidence()).toEqual({ bookings: 1, audits: 0, outbox: 0 });
    expect(await prisma.availedService.count({ where: { booking: { business_id: business.id } } })).toBe(1);
  });
  it.each(["owner", "staff"])("denies both mutations after current %s user role is revoked", async actor => {
    const context = actor === "owner" ? owner : staff; const prior = await ownGraph();
    await prisma.user.update({ where: { id: context.userId }, data: { role: Role.PLATFORM_ADMIN } });
    await expect(appendServicesToUntouchedBooking(params(context))).rejects.toThrow("Forbidden");
    await expect(createFollowUpAddOnBooking(params(context))).rejects.toThrow("Forbidden");
    expect(await ownGraph()).toEqual(prior); expect(await countEvidence()).toEqual({ bookings: 1, audits: 0, outbox: 0 });
  });
  it.each(["owner", "staff"])("denies both mutations after %s membership moves tenants", async actor => {
    const context = actor === "owner" ? owner : staff; const prior = await ownGraph();
    if (actor === "owner") await prisma.owner.update({ where: { id: owner.ownerId! }, data: { business_id: foreign.id } });
    else await prisma.employee.update({ where: { id: staff.employeeId! }, data: { business_id: foreign.id } });
    await expect(appendServicesToUntouchedBooking(params(context))).rejects.toThrow("Forbidden");
    await expect(createFollowUpAddOnBooking(params(context))).rejects.toThrow("Forbidden");
    expect(await ownGraph()).toEqual(prior); expect(await countEvidence()).toEqual({ bookings: 1, audits: 0, outbox: 0 });
  });
  it("denies currently revoked employee permission despite stale permitted context", async () => {
    await prisma.employee.update({ where: { id: staff.employeeId! }, data: { permissions: [StaffPermission.PAYMENT_COLLECT] } });
    await expect(appendServicesToUntouchedBooking(params(staff))).rejects.toThrow("Forbidden");
    await expect(createFollowUpAddOnBooking(params(staff))).rejects.toThrow("Forbidden");
    expect(await countEvidence()).toEqual({ bookings: 1, audits: 0, outbox: 0 });
  });
  it("denies foreign parent without altering either tenant", async () => {
    const prior = await prisma.booking.findUniqueOrThrow({ where: { id: foreignParentId }, include: { availed_services: true } });
    await expect(appendServicesToUntouchedBooking({ ...params(), bookingId: foreignParentId })).rejects.toThrow("Booking not found");
    await expect(createFollowUpAddOnBooking({ ...params(), bookingId: foreignParentId })).rejects.toThrow("Booking not found");
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: foreignParentId }, include: { availed_services: true } })).toEqual(prior);
    expect(await countEvidence()).toEqual({ bookings: 1, audits: 0, outbox: 0 });
  });
  it.each(["service", "package"])("denies foreign %s selection before any persistence", async reference => {
    const input = { ...params(), services: [{ id: reference === "service" ? foreignServiceId : serviceId, quantity: 1, packageId: reference === "package" ? foreignPackageId : packageId }] };
    const prior = await ownGraph();
    await expect(appendServicesToUntouchedBooking(input)).rejects.toThrow("invalid");
    await expect(createFollowUpAddOnBooking(input)).rejects.toThrow("invalid");
    expect(await ownGraph()).toEqual(prior); expect(await countEvidence()).toEqual({ bookings: 1, audits: 0, outbox: 0 });
  });
  it("denies a legacy parent linked to a foreign customer", async () => {
    await prisma.booking.update({ where: { id: parentId }, data: { customer_id: `${business.id}-customer-1` } });
    const prior = await ownGraph();
    await expect(appendServicesToUntouchedBooking(params())).rejects.toThrow("Customer not found");
    await expect(createFollowUpAddOnBooking(params())).rejects.toThrow("Customer not found");
    expect(await ownGraph()).toEqual(prior); expect(await countEvidence()).toEqual({ bookings: 1, audits: 0, outbox: 0 });
  });
  it("retains anonymous follow-up denial", async () => {
    await prisma.booking.update({ where: { id: parentId }, data: { customer_id: null, is_anonymous_walk_in: true } });
    await expect(createFollowUpAddOnBooking(params())).rejects.toThrow("anonymous walk-in");
    expect(await countEvidence()).toEqual({ bookings: 1, audits: 0, outbox: 0 });
  });
  it("emits state-race marker when payment starts before append transaction", async () => {
    await prisma.booking.update({ where: { id: parentId }, data: { amount_paid: 1, payment_status: "PARTIALLY_PAID" } });
    const prior = await ownGraph();
    await expect(appendServicesToUntouchedBooking(params())).rejects.toBeInstanceOf(BookingAddOnStateRaceError);
    expect(await ownGraph()).toEqual(prior); expect(await countEvidence()).toEqual({ bookings: 1, audits: 0, outbox: 0 });
  });
  it("denies owner selected initiator after employee user role is revoked", async () => {
    await prisma.user.update({ where: { id: staffUser.id }, data: { role: Role.PLATFORM_ADMIN } });
    const input = { ...params(), currentEmployeeId: staff.employeeId! };
    await expect(appendServicesToUntouchedBooking(input)).rejects.toThrow("Employee not found.");
    await expect(createFollowUpAddOnBooking(input)).rejects.toThrow("Employee not found.");
    expect(await countEvidence()).toEqual({ bookings: 1, audits: 0, outbox: 0 });
  });
});
