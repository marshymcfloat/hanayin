import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { completeBookingManually } from "@/features/bookings/services/booking-status";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failWrite: false, writeReached: false, failAudit: false, auditReached: false, afterRead: null as null | (() => Promise<void>) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/services/audit", async original => {
  const actual = await original<typeof import("@/lib/services/audit")>();
  return { ...actual, logAudit: async (...args: Parameters<typeof actual.logAudit>) => {
    const result = await actual.logAudit(...args);
    if (controls.failAudit) { controls.auditReached = true; throw new Error("Fixture post-audit-insert failure"); }
    return result;
  } };
});
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
                if (operation === "findFirst") return async (args: Prisma.BookingFindFirstArgs) => {
                  const result = await model.findFirst(args);
                  if (args.select?.payment_status && controls.afterRead) await controls.afterRead();
                  return result;
                };
                if (operation === "updateMany") return async (args: Prisma.BookingUpdateManyArgs) => {
                  const result = await model.updateMany(args);
                  if (controls.failWrite) { controls.writeReached = true; throw new Error("Fixture post-parent-write failure"); }
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
const factory = createSharedWorkflowFactory({ namespace: "integration-booking-status", now: date });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const tenants = [business.id, foreign.id];
const users = [factory.user({ contactNumber: "fixture-status-owner" }), factory.user({ id: `${business.id}-employee`, contactNumber: "fixture-status-employee", role: "EMPLOYEE" })];
const customers = tenants.map((businessId, index) => factory.customer({ businessId, id: `${business.id}-customer-${index}` }));
let ownerId: number; let employeeId: number; let bookingId: number; let lineId: number; let serviceId: number; let foreignServiceId: number; let foreignPackageId: number; let payslipId: number;
let owner: Parameters<typeof completeBookingManually>[0]; let manager: Parameters<typeof completeBookingManually>[0];
const target = () => prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
const customer = () => prisma.customer.findUniqueOrThrow({ where: { id: customers[0].id } });
const line = () => prisma.availedService.findUniqueOrThrow({ where: { id: lineId } });
const auditCount = () => prisma.auditLog.count({ where: { business_id: { in: tenants } } });
async function cleanup() {
  try { await prisma.auditLog.deleteMany({ where: { business_id: { in: tenants } } }); }
  finally {
    try { await prisma.business.deleteMany({ where: { id: { in: tenants } } }); }
    finally { await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); }
  }
}
async function assertDenied(actor = owner) {
  const before = await target(); const workBefore = await line(); const customerBefore = await customer();
  expect((await completeBookingManually(actor, bookingId)).success).toBe(false);
  expect(await target()).toEqual(before); expect(await line()).toEqual(workBefore); expect(await customer()).toEqual(customerBefore); expect(await auditCount()).toBe(0);
}

describe("manual completion in isolated PostgreSQL", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(date);
    try {
      await cleanup();
      for (const tenant of [business, foreign]) await prisma.business.create({ data: { id: tenant.id, slug: tenant.slug, name: tenant.name, initials: tenant.initials, structure: "MANAGER_LED", allow_employee_self_booking: false, manager_can_serve: false } });
      for (const user of users) await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: user.role } });
      ownerId = (await prisma.owner.create({ data: { user_id: users[0].id, business_id: business.id } })).id;
      employeeId = (await prisma.employee.create({ data: { user_id: users[1].id, business_id: business.id, salary: 0, profile: "MANAGER", permissions: ["BOOKING_MODIFY"] } })).id;
      for (const fixture of customers) await prisma.customer.create({ data: { id: fixture.id, business_id: fixture.businessId, name: fixture.name, email: fixture.email, phone: fixture.phone } });
      const service = factory.service();
      serviceId = (await prisma.service.create({ data: { business_id: business.id, name: service.name, category: service.category, price: service.price, duration: service.duration } })).id;
      foreignServiceId = (await prisma.service.create({ data: { business_id: foreign.id, name: service.name, category: service.category, price: service.price, duration: service.duration } })).id;
      foreignPackageId = (await prisma.servicePackage.create({ data: { business_id: foreign.id, name: "Foreign fixture package", category: service.category, price: service.price } })).id;
      const fixture = factory.booking({ paymentStatus: "PAID", amountPaid: service.price });
      bookingId = (await prisma.booking.create({ data: { business_id: business.id, customer_id: customers[0].id, grand_total: fixture.grandTotal, total_discount: fixture.totalDiscount, payment_status: fixture.paymentStatus, amount_paid: fixture.amountPaid } })).id;
      lineId = (await prisma.availedService.create({ data: { booking_id: bookingId, service_id: serviceId, status: "COMPLETED", completed_at: date, price: service.price, final_price: service.price, commission_base: service.price } })).id;
      payslipId = (await prisma.payslip.create({ data: { employee_id: employeeId, starting_date: date, ending_date: new Date(date.getTime() + 86400000), total_salary: 0, status: "PAID", released_at: date } })).id;
      const resolvedOwner = await resolveTenantActorContext(business.slug, users[0].id); const resolvedManager = await resolveTenantActorContext(business.slug, users[1].id);
      if (!resolvedOwner.success || !resolvedManager.success) throw new Error("Fixture actor resolution failed");
      owner = resolvedOwner; manager = resolvedManager;
    } catch (error) { await cleanup(); throw error; }
  });
  beforeEach(async () => {
    controls.failWrite = false; controls.writeReached = false; controls.failAudit = false; controls.auditReached = false; controls.afterRead = null;
    await prisma.auditLog.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.user.update({ where: { id: users[0].id }, data: { role: "OWNER" } }); await prisma.user.update({ where: { id: users[1].id }, data: { role: "EMPLOYEE" } });
    await prisma.owner.update({ where: { id: ownerId }, data: { business_id: business.id } });
    await prisma.employee.update({ where: { id: employeeId }, data: { business_id: business.id, profile: "MANAGER", permissions: ["BOOKING_MODIFY"] } });
    await prisma.booking.update({ where: { id: bookingId }, data: { business_id: business.id, customer_id: customers[0].id, status: "ACCEPTED", cancelled_at: null, cancelled_by_customer: false, cancelled_by_id: null, cancellation_reason: null, is_anonymous_walk_in: false, payment_status: "PAID", amount_paid: factory.service().price } });
    await prisma.availedService.deleteMany({ where: { booking_id: bookingId, id: { not: lineId } } });
    await prisma.availedService.update({ where: { id: lineId }, data: { service_id: serviceId, package_id: null, status: "COMPLETED", served_at: date, completed_at: date, cancelled_at: null, paid_in_payslip_id: null } });
  });
  afterAll(async () => { controls.afterRead = null; controls.failWrite = false; controls.failAudit = false; try { await cleanup(); } finally { vi.useRealTimers(); await prisma.$disconnect(); } });

  it("commits only parent status and the verified audit, leaving work, payment and trust unchanged", async () => {
    const before = await target(); const workBefore = await line(); const customerBefore = await customer();
    expect(await completeBookingManually(owner, bookingId)).toEqual({ success: true });
    expect(await target()).toMatchObject({ status: "COMPLETED", amount_paid: before.amount_paid, payment_status: before.payment_status, cancellation_reason: null, cancelled_at: null });
    expect(await line()).toEqual(workBefore); expect(await customer()).toEqual(customerBefore);
    expect(await auditCount()).toBe(1); expect(await prisma.auditLog.findFirst({ where: { business_id: business.id } })).toMatchObject({ actor_id: users[0].id, entity_id: String(bookingId), action: "STATUS_CHANGED", changes: { before: { status: "ACCEPTED" }, after: { status: "COMPLETED", mode: "BOOKING_MANUAL_COMPLETION" } } });
    expect(await prisma.outboxMessage.count({ where: { business_id: business.id } })).toBe(0); expect(await prisma.bookingPayment.count({ where: { booking_id: bookingId } })).toBe(0);
  });
  it("allows finished mixed cancelled/payroll work without rewriting the lines", async () => {
    await prisma.availedService.update({ where: { id: lineId }, data: { paid_in_payslip_id: payslipId } });
    const service = factory.service();
    const cancelled = await prisma.availedService.create({ data: { booking_id: bookingId, service_id: serviceId, status: "CANCELLED", cancelled_at: date, price: service.price, final_price: service.price, commission_base: service.price } });
    const paid = await line(); expect(await completeBookingManually(owner, bookingId)).toEqual({ success: true }); expect(await line()).toEqual(paid);
    expect(await prisma.availedService.findUniqueOrThrow({ where: { id: cancelled.id } })).toEqual(cancelled);
  });
  it("allows anonymous paid completion without a customer write", async () => {
    await prisma.booking.update({ where: { id: bookingId }, data: { customer_id: null, is_anonymous_walk_in: true } }); const before = await customer();
    expect(await completeBookingManually(owner, bookingId)).toEqual({ success: true }); expect(await customer()).toEqual(before); expect(await auditCount()).toBe(1);
  });
  it.each(["STAFF", "MANAGER", "CASHIER"] as const)("preserves explicit %s MODIFY grant", async profile => {
    await prisma.employee.update({ where: { id: employeeId }, data: { profile, permissions: ["BOOKING_MODIFY"] } });
    expect(await completeBookingManually(manager, bookingId)).toEqual({ success: true }); expect(await auditCount()).toBe(1);
  });
  it.each(["STAFF", "MANAGER"] as const)("preserves %s empty-array defaults", async profile => {
    await prisma.employee.update({ where: { id: employeeId }, data: { profile, permissions: [] } }); expect(await completeBookingManually(manager, bookingId)).toEqual({ success: true });
  });
  it.each(["owner-role", "owner-membership", "employee-role", "employee-membership", "permission", "cashier-default"])("denies current %s revocation", async revoked => {
    if (revoked === "owner-role") await prisma.user.update({ where: { id: users[0].id }, data: { role: "EMPLOYEE" } });
    if (revoked === "owner-membership") await prisma.owner.update({ where: { id: ownerId }, data: { business_id: foreign.id } });
    if (revoked === "employee-role") await prisma.user.update({ where: { id: users[1].id }, data: { role: "PLATFORM_ADMIN" } });
    if (revoked === "employee-membership") await prisma.employee.update({ where: { id: employeeId }, data: { business_id: foreign.id } });
    if (revoked === "permission") await prisma.employee.update({ where: { id: employeeId }, data: { permissions: ["PAYMENT_COLLECT"] } });
    if (revoked === "cashier-default") await prisma.employee.update({ where: { id: employeeId }, data: { profile: "CASHIER", permissions: [] } });
    await assertDenied(revoked.startsWith("owner") ? owner : manager);
  });
  it.each(["parent", "customer", "service", "package"])("denies foreign %s reference", async reference => {
    if (reference === "parent") await prisma.booking.update({ where: { id: bookingId }, data: { business_id: foreign.id } });
    if (reference === "customer") await prisma.booking.update({ where: { id: bookingId }, data: { customer_id: customers[1].id } });
    if (reference === "service") await prisma.availedService.update({ where: { id: lineId }, data: { service_id: foreignServiceId } });
    if (reference === "package") await prisma.availedService.update({ where: { id: lineId }, data: { package_id: foreignPackageId } });
    await assertDenied();
  });
  it.each(["HOLD", "CANCELLED", "COMPLETED", "soft-cancelled", "customer-cancelled"])("denies %s source", async state => {
    await prisma.booking.update({ where: { id: bookingId }, data: state === "soft-cancelled" ? { cancelled_at: date } : state === "customer-cancelled" ? { cancelled_by_customer: true } : { status: state as "HOLD" | "CANCELLED" | "COMPLETED" } }); await assertDenied();
  });
  it.each(["UNPAID", "PARTIALLY_PAID"] as const)("denies %s even with finished lines", async payment_status => {
    await prisma.booking.update({ where: { id: bookingId }, data: { payment_status } }); await assertDenied();
  });
  it.each(["PENDING", "CLAIMED", "SERVING"] as const)("denies %s work even with payroll linkage", async status => {
    await prisma.availedService.update({ where: { id: lineId }, data: { status, paid_in_payslip_id: payslipId } }); await assertDenied();
  });
  it.each(["write", "audit"])("rolls back actual post-%s failure", async step => {
    const before = await target(); controls.failWrite = step === "write"; controls.failAudit = step === "audit";
    expect(await completeBookingManually(owner, bookingId)).toEqual({ success: false, error: "Failed to update status" });
    expect(step === "write" ? controls.writeReached : controls.auditReached).toBe(true); expect(await target()).toEqual(before); expect(await auditCount()).toBe(0);
  });
  it("rejects duplicate completion without additional audits", async () => {
    expect(await completeBookingManually(owner, bookingId)).toEqual({ success: true }); const before = await target();
    expect((await completeBookingManually(owner, bookingId)).success).toBe(false); expect(await target()).toEqual(before); expect(await auditCount()).toBe(1);
  });
  it("permits one winner from forced same-parent snapshots", async () => {
    let arrivals = 0; let release!: () => void;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const gate = new Promise<void>((resolve, reject) => { release = resolve; timer = setTimeout(() => reject(new Error("Fixture requires two transaction connections")), 5000); });
    controls.afterRead = async () => { if (++arrivals === 2) { clearTimeout(timer); release(); } await gate; };
    try {
      const results = await Promise.all([completeBookingManually(owner, bookingId), completeBookingManually(manager, bookingId)]);
      expect(arrivals).toBe(2); expect(results.filter(result => result.success)).toHaveLength(1); expect((await target()).status).toBe("COMPLETED"); expect(await auditCount()).toBe(1);
    } finally { controls.afterRead = null; clearTimeout(timer); }
  }, 15000);
  it.each(["payment", "status"])("rejects a %s change committed after the read but before the conditional write", async changed => {
    let reached!: () => void; let release!: () => void; let timer: ReturnType<typeof setTimeout> | undefined;
    const read = new Promise<void>(resolve => { reached = resolve; });
    const gate = new Promise<void>((resolve, reject) => { release = resolve; timer = setTimeout(() => reject(new Error("Fixture requires two transaction connections")), 5000); });
    controls.afterRead = async () => { reached(); await gate; };
    const pending = completeBookingManually(owner, bookingId);
    try {
      await Promise.race([read, gate]);
      await prisma.booking.update({ where: { id: bookingId }, data: changed === "payment" ? { payment_status: "UNPAID", amount_paid: 0 } : { status: "CANCELLED" } });
      release(); expect(await pending).toEqual({ success: false, error: "Failed to update status" });
      expect(await target()).toMatchObject(changed === "payment" ? { status: "ACCEPTED", payment_status: "UNPAID" } : { status: "CANCELLED", payment_status: "PAID" }); expect(await auditCount()).toBe(0);
    } finally { release(); controls.afterRead = null; clearTimeout(timer); await pending; }
  }, 15000);
});
