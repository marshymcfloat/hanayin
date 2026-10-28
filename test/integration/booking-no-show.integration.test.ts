import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { markBookingNoShow } from "@/features/bookings/services/booking-no-show";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failCustomer: false, customerReached: false, failAuditOn: 0, auditCalls: 0, auditReached: false, transactionFailure: "none", arrive: null as null | (() => Promise<void>) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/services/audit", async original => {
  const actual = await original<typeof import("@/lib/services/audit")>();
  return { ...actual, logAudit: async (...args: Parameters<typeof actual.logAudit>) => {
    const result = await actual.logAudit(...args);
    if (++controls.auditCalls === controls.failAuditOn) { controls.auditReached = true; throw new Error("Fixture post-audit-insert failure"); }
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
            if (member !== "customer") return Reflect.get(transaction, member);
            return new Proxy(transaction.customer, {
              get(model, operation) {
                if (operation === "findFirst") return async (args: Prisma.CustomerFindFirstArgs) => {
                  const result = await model.findFirst(args);
                  if (args.select?.no_show_count && controls.arrive) await controls.arrive();
                  return result;
                };
                if (operation === "updateMany") return async (args: Prisma.CustomerUpdateManyArgs) => {
                  const result = await model.updateMany(args);
                  if (controls.failCustomer) { controls.customerReached = true; throw new Error("Fixture post-customer-write failure"); }
                  return result;
                };
                const value = Reflect.get(model, operation);
                return typeof value === "function" ? value.bind(model) : value;
              },
            });
          },
        })), options).catch((error: unknown) => {
          const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
          controls.transactionFailure = typeof code === "string" && /^P\d{4}$/.test(code) ? code : "non-Prisma transaction failure";
          if (controls.transactionFailure === "P2034") console.info("Fixture transaction conflict: P2034");
          throw error;
        });
      const value = Reflect.get(client, key);
      return typeof value === "function" ? value.bind(client) : value;
    },
  }) };
});
requireTestDatabase();

const date = new Date("2030-01-15T09:00:00Z");
const factory = createSharedWorkflowFactory({ namespace: "integration-booking-no-show", now: date });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const tenants = [business.id, foreign.id];
const users = [factory.user({ contactNumber: "fixture-no-show-owner" }), factory.user({ id: `${business.id}-employee`, contactNumber: "fixture-no-show-employee", role: "EMPLOYEE" })];
const customers = tenants.map((businessId, index) => factory.customer({ businessId, id: `${business.id}-customer-${index}` }));
const bookings: number[] = [];
let ownerId: number; let employeeId: number; let serviceId: number; let targetId: number; let payslipId: number;
let owner: Parameters<typeof markBookingNoShow>[0];
let manager: Parameters<typeof markBookingNoShow>[0];
const target = () => prisma.booking.findUniqueOrThrow({ where: { id: bookings[0] } });
const customer = () => prisma.customer.findUniqueOrThrow({ where: { id: customers[0].id } });
const auditCount = () => prisma.auditLog.count({ where: { business_id: { in: tenants } } });
async function cleanup() {
  try { await prisma.auditLog.deleteMany({ where: { business_id: { in: tenants } } }); }
  finally {
    try { await prisma.business.deleteMany({ where: { id: { in: tenants } } }); }
    finally { await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); }
  }
}
async function concurrent(work: () => Promise<unknown[]>) {
  let arrivals = 0; let release!: () => void; let timer: ReturnType<typeof setTimeout> | undefined;
  const gate = new Promise<void>((resolve, reject) => { release = resolve; timer = setTimeout(() => reject(new Error("Fixture requires two transaction connections")), 5000); });
  controls.arrive = async () => { if (++arrivals === 2) { clearTimeout(timer); release(); } await gate; };
  try { const results = await work(); expect(arrivals).toBe(2); return results; }
  finally { controls.arrive = null; clearTimeout(timer); }
}

describe("atomic no-show in isolated PostgreSQL", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(date); await cleanup();
    for (const tenant of [business, foreign]) await prisma.business.create({ data: { id: tenant.id, slug: tenant.slug, name: tenant.name, initials: tenant.initials, structure: "MANAGER_LED", allow_employee_self_booking: false, manager_can_serve: false } });
    for (const user of users) await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: user.role } });
    ownerId = (await prisma.owner.create({ data: { user_id: users[0].id, business_id: business.id } })).id;
    employeeId = (await prisma.employee.create({ data: { user_id: users[1].id, business_id: business.id, salary: 0, profile: "MANAGER", permissions: ["BOOKING_MARK_NO_SHOW"] } })).id;
    for (const fixture of customers) await prisma.customer.create({ data: { id: fixture.id, business_id: fixture.businessId, name: fixture.name, email: fixture.email, phone: fixture.phone } });
    const service = factory.service();
    serviceId = (await prisma.service.create({ data: { business_id: business.id, name: service.name, category: service.category, price: service.price, duration: service.duration } })).id;
    const fixture = factory.booking();
    for (let index = 0; index < 2; index++) bookings.push((await prisma.booking.create({ data: { business_id: business.id, customer_id: customers[0].id, grand_total: fixture.grandTotal, total_discount: fixture.totalDiscount, scheduled_at: new Date(fixture.scheduledAt.getTime() + index * 86400000), estimated_end: new Date(fixture.estimatedEnd.getTime() + index * 86400000) } })).id);
    targetId = (await prisma.availedService.create({ data: { booking_id: bookings[0], service_id: serviceId, price: service.price, final_price: service.price, commission_base: service.price } })).id;
    payslipId = (await prisma.payslip.create({ data: { employee_id: employeeId, starting_date: date, ending_date: new Date(date.getTime() + 86400000), total_salary: 0, status: "PAID", released_at: date } })).id;
    const resolvedOwner = await resolveTenantActorContext(business.slug, users[0].id);
    const resolvedManager = await resolveTenantActorContext(business.slug, users[1].id);
    if (!resolvedOwner.success || !resolvedManager.success) throw new Error("Fixture actor resolution failed");
    owner = resolvedOwner; manager = resolvedManager;
  });
  beforeEach(async () => {
    controls.failCustomer = false; controls.customerReached = false; controls.failAuditOn = 0; controls.auditCalls = 0; controls.auditReached = false; controls.arrive = null; controls.transactionFailure = "none";
    await prisma.auditLog.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.user.update({ where: { id: users[0].id }, data: { role: "OWNER" } });
    await prisma.user.update({ where: { id: users[1].id }, data: { role: "EMPLOYEE" } });
    await prisma.owner.update({ where: { id: ownerId }, data: { business_id: business.id } });
    await prisma.employee.update({ where: { id: employeeId }, data: { business_id: business.id, profile: "MANAGER", permissions: ["BOOKING_MARK_NO_SHOW"] } });
    await prisma.customer.update({ where: { id: customers[0].id }, data: { business_id: business.id, no_show_count: 0, last_no_show_at: null, trust_tier: "NEW" } });
    await prisma.booking.updateMany({ where: { id: { in: bookings } }, data: { business_id: business.id, customer_id: customers[0].id, status: "ACCEPTED", cancelled_at: null, cancelled_by_id: null, cancellation_reason: null, is_anonymous_walk_in: false, customer_label: null, payment_status: "UNPAID", amount_paid: 0 } });
    await prisma.availedService.update({ where: { id: targetId }, data: { status: "PENDING", served_at: null, completed_at: null, cancelled_at: null, paid_in_payslip_id: null } });
  });
  afterAll(async () => {
    controls.failCustomer = false; controls.failAuditOn = 0; controls.arrive = null;
    try { await cleanup(); } finally { vi.useRealTimers(); await prisma.$disconnect(); }
  });
  it("commits status-only no-show, first counter/date and verified customer/booking audits", async () => {
    const line = await prisma.availedService.findUniqueOrThrow({ where: { id: targetId } });
    expect(await markBookingNoShow(owner, bookings[0])).toEqual({ success: true });
    expect(await target()).toMatchObject({ status: "CANCELLED", cancelled_at: null, cancelled_by_id: null, cancellation_reason: null, payment_status: "UNPAID", amount_paid: 0 });
    expect(await customer()).toMatchObject({ no_show_count: 1, last_no_show_at: date, trust_tier: "NEW" });
    expect(await prisma.availedService.findUniqueOrThrow({ where: { id: targetId } })).toEqual(line);
    expect(await auditCount()).toBe(2); expect(await prisma.auditLog.count({ where: { business_id: business.id, actor_id: users[0].id } })).toBe(2);
    expect(await prisma.outboxMessage.count({ where: { business_id: business.id } })).toBe(0);
  });
  it("restricts the second no-show and preserves received money on prepaid bookings", async () => {
    await prisma.customer.update({ where: { id: customers[0].id }, data: { no_show_count: 1, trust_tier: "TRUSTED" } });
    await prisma.booking.update({ where: { id: bookings[0] }, data: { payment_status: "PAID", amount_paid: 100 } });
    expect(await markBookingNoShow(owner, bookings[0])).toEqual({ success: true }); expect(await customer()).toMatchObject({ no_show_count: 2, trust_tier: "RESTRICTED", last_no_show_at: date });
    expect(await target()).toMatchObject({ payment_status: "PAID", amount_paid: 100 }); expect(await prisma.bookingPayment.count({ where: { booking_id: bookings[0] } })).toBe(0);
  });
  it("supports anonymous HOLD no-show with only a booking audit", async () => {
    await prisma.booking.update({ where: { id: bookings[0] }, data: { status: "HOLD", customer_id: null, is_anonymous_walk_in: true, customer_label: "Fixture walk-in" } });
    expect(await markBookingNoShow(owner, bookings[0])).toEqual({ success: true }); expect((await target()).status).toBe("CANCELLED"); expect((await customer()).no_show_count).toBe(0); expect(await auditCount()).toBe(1);
  });
  it("supports allowed manager without CREATE/MODIFY or a new SETTINGS gate", async () => {
    expect(await markBookingNoShow(manager, bookings[0])).toEqual({ success: true }); expect((await customer()).no_show_count).toBe(1); expect(await prisma.auditLog.count({ where: { business_id: business.id, actor_id: users[1].id } })).toBe(2);
  });
  it.each(["customer-write", "customer-audit", "booking-audit"])("rolls back actual parent/counter/trust and inserted audit on %s failure", async failure => {
    await prisma.customer.update({ where: { id: customers[0].id }, data: { no_show_count: 1, trust_tier: "TRUSTED" } });
    const before = await target(); const customerBefore = await customer();
    controls.failCustomer = failure === "customer-write"; controls.failAuditOn = failure === "customer-audit" ? 1 : failure === "booking-audit" ? 2 : 0;
    expect(await markBookingNoShow(owner, bookings[0])).toEqual({ success: false, error: "Failed to mark as no-show." });
    expect(failure === "customer-write" ? controls.customerReached : controls.auditReached, `Transaction failure: ${controls.transactionFailure}`).toBe(true);
    expect(await target()).toEqual(before); expect(await customer()).toEqual(customerBefore); expect(await auditCount()).toBe(0);
  });
  it.each(["owner-role", "owner-membership", "employee-role", "employee-membership", "permission", "profile"])("denies %s revoked after original context resolution", async revoked => {
    if (revoked === "owner-role") await prisma.user.update({ where: { id: users[0].id }, data: { role: "EMPLOYEE" } });
    if (revoked === "owner-membership") await prisma.owner.update({ where: { id: ownerId }, data: { business_id: foreign.id } });
    if (revoked === "employee-role") await prisma.user.update({ where: { id: users[1].id }, data: { role: "PLATFORM_ADMIN" } });
    if (revoked === "employee-membership") await prisma.employee.update({ where: { id: employeeId }, data: { business_id: foreign.id } });
    if (revoked === "permission") await prisma.employee.update({ where: { id: employeeId }, data: { permissions: ["PAYMENT_COLLECT"] } });
    if (revoked === "profile") await prisma.employee.update({ where: { id: employeeId }, data: { profile: "CASHIER", permissions: [] } });
    expect(await markBookingNoShow(revoked.startsWith("owner") ? owner : manager, bookings[0])).toEqual({ success: false, error: "Forbidden" }); expect((await target()).status).toBe("ACCEPTED"); expect((await customer()).no_show_count).toBe(0); expect(await auditCount()).toBe(0);
  });
  it.each(["STAFF", "MANAGER"] as const)("preserves %s effective permission from an empty stored array", async profile => {
    await prisma.employee.update({ where: { id: employeeId }, data: { profile, permissions: [] } });
    expect(await markBookingNoShow(manager, bookings[0])).toEqual({ success: true }); expect((await customer()).no_show_count).toBe(1);
  });
  it("preserves explicitly enabled cashier capability without defaulting it on", async () => {
    await prisma.employee.update({ where: { id: employeeId }, data: { profile: "CASHIER", permissions: ["BOOKING_MARK_NO_SHOW"] } });
    expect(await markBookingNoShow(manager, bookings[0])).toEqual({ success: true }); expect((await customer()).no_show_count).toBe(1);
  });
  it.each(["parent", "customer"])("denies foreign %s reference without parent/counter writes", async reference => {
    await prisma.booking.update({ where: { id: bookings[0] }, data: reference === "parent" ? { business_id: foreign.id } : { customer_id: customers[1].id } });
    const before = await target();
    expect(await markBookingNoShow(owner, bookings[0])).toEqual({ success: false, error: "Booking not found." }); expect(await target()).toEqual(before); expect((await customer()).no_show_count).toBe(0); expect(await auditCount()).toBe(0);
  });
  it.each(["CANCELLED", "COMPLETED", "soft-cancelled"])("preserves %s parent denial without penalizing the customer", async state => {
    await prisma.booking.update({ where: { id: bookings[0] }, data: state === "soft-cancelled" ? { cancelled_at: date } : { status: state as "CANCELLED" | "COMPLETED" } });
    expect(await markBookingNoShow(owner, bookings[0])).toEqual({ success: false, error: state === "COMPLETED" ? "Cannot mark a completed booking as no-show." : "Booking is already cancelled." }); expect((await customer()).no_show_count).toBe(0); expect(await auditCount()).toBe(0);
  });
  it.each(["SERVING", "COMPLETED", "served-marker", "completion-marker", "payroll"])("denies %s work without reclassifying its parent", async state => {
    await prisma.availedService.update({ where: { id: targetId }, data: state === "SERVING" || state === "COMPLETED" ? { status: state } : state === "served-marker" ? { served_at: date } : state === "completion-marker" ? { completed_at: date } : { paid_in_payslip_id: payslipId } });
    const line = await prisma.availedService.findUniqueOrThrow({ where: { id: targetId } });
    expect(await markBookingNoShow(owner, bookings[0])).toEqual({ success: false, error: "Failed to mark as no-show." }); expect((await target()).status).toBe("ACCEPTED"); expect((await customer()).no_show_count).toBe(0); expect(await auditCount()).toBe(0); expect(await prisma.availedService.findUniqueOrThrow({ where: { id: targetId } })).toEqual(line);
  });
  it("rejects duplicate no-show without another counter/audit write", async () => {
    expect(await markBookingNoShow(owner, bookings[0])).toEqual({ success: true });
    const before = await customer(); expect(await markBookingNoShow(owner, bookings[0])).toEqual({ success: false, error: "Booking is already cancelled." }); expect(await customer()).toEqual(before); expect(await auditCount()).toBe(2);
  });
  it("allows one winner from forced same-booking/customer snapshots", async () => {
    const results = await concurrent(() => Promise.all([markBookingNoShow(owner, bookings[0]), markBookingNoShow(manager, bookings[0])]));
    expect(results.filter(result => (result as { success: boolean }).success)).toHaveLength(1); expect((await target()).status).toBe("CANCELLED"); expect((await customer()).no_show_count).toBe(1); expect(await auditCount()).toBe(2);
    expect(results.find(result => !(result as { success: boolean }).success)).toEqual({ success: false, error: "Failed to mark as no-show." });
  }, 15000);
  it("rolls back the losing different-booking counter race and permits a fresh retry", async () => {
    const results = await concurrent(() => Promise.all(bookings.map(bookingId => markBookingNoShow(owner, bookingId))));
    expect(results.filter(result => (result as { success: boolean }).success)).toHaveLength(1); expect((await customer()).no_show_count).toBe(1); expect(await auditCount()).toBe(2);
    const loser = results.findIndex(result => !(result as { success: boolean }).success);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookings[loser] } })).status).toBe("ACCEPTED");
    expect(await markBookingNoShow(owner, bookings[loser])).toEqual({ success: true }); expect(await customer()).toMatchObject({ no_show_count: 2, trust_tier: "RESTRICTED" }); expect(await auditCount()).toBe(4);
  }, 15000);
});
