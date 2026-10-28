import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { deleteBookingPermanently } from "@/features/bookings/services/booking-deletion";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failAfterDelete: false, deleteReached: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: vi.fn() }));
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, {
    get(client, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) =>
        client.$transaction(tx => work(new Proxy(tx, {
          get(transaction, member) {
            if (member !== "booking") return Reflect.get(transaction, member);
            return new Proxy(transaction.booking, {
              get(model, operation) {
                if (operation === "delete") return async (args: Prisma.BookingDeleteArgs) => {
                  const result = await model.delete(args);
                  if (controls.failAfterDelete) { controls.deleteReached = true; throw new Error("Fixture post-delete failure"); }
                  return result;
                };
                const value = Reflect.get(model, operation);
                return typeof value === "function" ? value.bind(model) : value;
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

const date = new Date("2030-01-15T09:00:00Z");
const factory = createSharedWorkflowFactory({ namespace: "integration-booking-deletion", now: date });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const tenants = [business.id, foreign.id];
const users = [factory.user({ contactNumber: "fixture-deletion-owner" }), factory.user({ id: `${business.id}-employee`, contactNumber: "fixture-deletion-employee", role: "EMPLOYEE" })];
const customers = tenants.map((businessId, index) => factory.customer({ businessId, id: `${business.id}-customer-${index}` }));
let ownerId: number; let serviceId: number; let bookingId: number; let foreignBookingId: number;
let owner: Parameters<typeof deleteBookingPermanently>[0];
const target = () => prisma.booking.findUnique({ where: { id: bookingId } });
async function children() {
  const where = { booking_id: bookingId };
  return {
    lines: await prisma.availedService.findMany({ where }),
    payments: await prisma.bookingPayment.findMany({ where }),
    vouchers: await prisma.voucher.findMany({ where: { used_by_id: bookingId } }),
    notes: await prisma.bookingNote.findMany({ where }),
    adjustments: await prisma.bookingPriceAdjustment.findMany({ where }),
  };
}
async function cleanup() {
  try { await prisma.business.deleteMany({ where: { id: { in: tenants } } }); }
  finally { await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); }
}
async function denied(actor = owner, id = bookingId) {
  const before = await target(); const childrenBefore = await children();
  expect((await deleteBookingPermanently(actor, id)).success).toBe(false);
  expect(await target()).toEqual(before); expect(await children()).toEqual(childrenBefore);
}

describe("permanent booking deletion in isolated PostgreSQL", () => {
  beforeAll(async () => {
    try {
      await cleanup();
      for (const tenant of [business, foreign]) await prisma.business.create({ data: { id: tenant.id, slug: tenant.slug, name: tenant.name, initials: tenant.initials } });
      for (const user of users) await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: user.role } });
      ownerId = (await prisma.owner.create({ data: { user_id: users[0].id, business_id: business.id } })).id;
      await prisma.employee.create({ data: { user_id: users[1].id, business_id: business.id, salary: 0, profile: "MANAGER", permissions: ["BOOKING_MODIFY", "BOOKING_CANCEL"] } });
      for (const fixture of customers) await prisma.customer.create({ data: { id: fixture.id, business_id: fixture.businessId, name: fixture.name, email: fixture.email, phone: fixture.phone } });
      const service = factory.service();
      serviceId = (await prisma.service.create({ data: { business_id: business.id, name: service.name, category: service.category, price: service.price, duration: service.duration } })).id;
      foreignBookingId = (await prisma.booking.create({ data: { business_id: foreign.id, customer_id: customers[1].id, grand_total: service.price, total_discount: 0 } })).id;
      const context = await resolveTenantActorContext(business.slug, users[0].id);
      if (!context.success || context.actorType !== "OWNER") throw new Error("Fixture owner resolution failed");
      owner = context;
    } catch (error) { await cleanup(); throw error; }
  });
  beforeEach(async () => {
    controls.failAfterDelete = false; controls.deleteReached = false;
    await prisma.user.update({ where: { id: users[0].id }, data: { role: "OWNER" } });
    await prisma.owner.update({ where: { id: ownerId }, data: { business_id: business.id } });
    await prisma.bookingPriceAdjustment.deleteMany({ where: { booking_id: foreignBookingId } });
    await prisma.booking.deleteMany({ where: { business_id: business.id } });
    const fixture = factory.booking();
    bookingId = (await prisma.booking.create({ data: { business_id: business.id, customer_id: customers[0].id, grand_total: fixture.grandTotal, total_discount: fixture.totalDiscount } })).id;
    const service = factory.service();
    const line = await prisma.availedService.create({ data: { booking_id: bookingId, service_id: serviceId, status: "COMPLETED", price: service.price, final_price: service.price, commission_base: service.price } });
    await prisma.bookingPayment.create({ data: { booking_id: bookingId, type: "FULL", status: "SUCCEEDED", payment_method: "CASH", amount_principal: service.price, amount_charged: service.price } });
    await prisma.voucher.create({ data: { business_id: business.id, used_by_id: bookingId, code: `${business.id}-used-voucher`, value: 5, type: "PERCENTAGE", expires_at: new Date("2031-01-15T09:00:00Z") } });
    await prisma.bookingNote.create({ data: { booking_id: bookingId, body: "Fixture internal note", created_by_user_id: users[0].id } });
    await prisma.bookingPriceAdjustment.create({ data: { booking_id: bookingId, availed_service_id: line.id, delta_amount: -5, reason: "Fixture adjustment", created_by_user_id: users[0].id } });
  });
  afterAll(async () => { controls.failAfterDelete = false; try { await cleanup(); } finally { await prisma.$disconnect(); } });

  it("preserves database cascades and leaves customer, catalog, owner and foreign tenant unchanged", async () => {
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customers[0].id } });
    const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
    const storedOwner = await prisma.owner.findUniqueOrThrow({ where: { id: ownerId } });
    const foreignBefore = await prisma.booking.findUniqueOrThrow({ where: { id: foreignBookingId } });
    expect(await deleteBookingPermanently(owner, bookingId)).toEqual({ success: true });
    expect(await target()).toBeNull(); expect(await children()).toEqual({ lines: [], payments: [], vouchers: [], notes: [], adjustments: [] });
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: customers[0].id } })).toEqual(customer);
    expect(await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })).toEqual(service);
    expect(await prisma.owner.findUniqueOrThrow({ where: { id: ownerId } })).toEqual(storedOwner);
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: foreignBookingId } })).toEqual(foreignBefore);
    expect(await prisma.auditLog.count({ where: { business_id: business.id } })).toBe(0);
    expect(await prisma.outboxMessage.count({ where: { business_id: business.id } })).toBe(0);
  });
  it.each(["HOLD", "ACCEPTED", "COMPLETED", "CANCELLED"] as const)("preserves %s deletion policy regardless of payment", async status => {
    for (const payment_status of ["UNPAID", "PARTIALLY_PAID", "PAID"] as const) {
      const booking = await prisma.booking.create({ data: { business_id: business.id, customer_id: customers[0].id, status, payment_status, grand_total: 799, total_discount: 0 } });
      expect(await deleteBookingPermanently(owner, booking.id)).toEqual({ success: true });
      expect(await prisma.booking.findUnique({ where: { id: booking.id } })).toBeNull();
    }
  });
  it("allows anonymous walk-in deletion without introducing customer constraints", async () => {
    await prisma.booking.update({ where: { id: bookingId }, data: { customer_id: null, is_anonymous_walk_in: true, customer_label: "Fixture walk-in" } });
    expect(await deleteBookingPermanently(owner, bookingId)).toEqual({ success: true }); expect(await target()).toBeNull();
  });
  it("preserves soft-cancelled deletion without retention policy changes", async () => {
    await prisma.booking.update({ where: { id: bookingId }, data: { cancelled_at: date, cancelled_by_customer: true, cancellation_reason: "Fixture" } });
    expect(await deleteBookingPermanently(owner, bookingId)).toEqual({ success: true }); expect(await target()).toBeNull();
  });
  it.each(["role", "membership", "owner-id", "business-id", "slug"])("denies stale %s with no parent or child mutation", async stale => {
    if (stale === "role") { await prisma.user.update({ where: { id: users[0].id }, data: { role: "EMPLOYEE" } }); await denied(); }
    if (stale === "membership") { await prisma.owner.update({ where: { id: ownerId }, data: { business_id: foreign.id } }); await denied(); }
    if (stale === "owner-id") await denied({ ...owner, ownerId: owner.ownerId + 1 });
    if (stale === "business-id") await denied({ ...owner, businessId: foreign.id });
    if (stale === "slug") await denied({ ...owner, businessSlug: foreign.slug });
  });
  it("denies employee grants without expanding permanent deletion permissions", async () => {
    const employee = await resolveTenantActorContext(business.slug, users[1].id);
    if (!employee.success) throw new Error("Fixture employee missing");
    await denied(employee as Parameters<typeof deleteBookingPermanently>[0]);
  });
  it("preserves foreign-booking missing-record semantics without affecting either tenant", async () => {
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: foreignBookingId } });
    expect(await deleteBookingPermanently(owner, foreignBookingId)).toEqual({ success: false, error: "Failed to delete." });
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: foreignBookingId } })).toEqual(before); await denied(owner, foreignBookingId);
  });
  it("preserves repeated-delete missing-record punctuation", async () => {
    expect(await deleteBookingPermanently(owner, bookingId)).toEqual({ success: true });
    expect(await deleteBookingPermanently(owner, bookingId)).toEqual({ success: false, error: "Failed to delete." });
  });
  it("denies a foreign-tenant voucher backlink instead of cascading its deletion", async () => {
    const voucher = await prisma.voucher.create({ data: { business_id: foreign.id, used_by_id: bookingId, code: `${business.id}-foreign-used-voucher`, value: 5, type: "PERCENTAGE", expires_at: new Date("2031-01-15T09:00:00Z") } });
    expect(await deleteBookingPermanently(owner, bookingId)).toEqual({ success: false, error: "Failed to delete." });
    expect(await prisma.voucher.findUniqueOrThrow({ where: { id: voucher.id } })).toEqual(voucher); await denied();
  });
  it("denies a foreign booking adjustment backlink instead of setting its service reference null", async () => {
    const [line] = await prisma.availedService.findMany({ where: { booking_id: bookingId } });
    const adjustment = await prisma.bookingPriceAdjustment.create({ data: { booking_id: foreignBookingId, availed_service_id: line.id, delta_amount: -5, reason: "Foreign fixture backlink" } });
    expect(await deleteBookingPermanently(owner, bookingId)).toEqual({ success: false, error: "Failed to delete." });
    expect(await prisma.bookingPriceAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } })).toEqual(adjustment); await denied();
  });
  it("rolls back parent and every cascade if the transaction fails after deletion", async () => {
    controls.failAfterDelete = true;
    const before = await target(); const childrenBefore = await children();
    expect(await deleteBookingPermanently(owner, bookingId)).toEqual({ success: false, error: "Failed to delete" });
    expect(controls.deleteReached).toBe(true); expect(await target()).toEqual(before); expect(await children()).toEqual(childrenBefore);
  });
});
