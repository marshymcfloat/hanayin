import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { claimOwnerService, unclaimOwnerService } from "@/features/dashboard/services/owner-queue-claims";
import { serveOwnerService, undoOwnerServiceServing } from "@/features/dashboard/services/owner-queue-serving";
import { getTenantPendingServiceQueue, getTenantOwnerClaimedServiceQueue } from "@/features/dashboard/queries/service-queues";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failAudit: false, auditReached: false, failParent: false, parentReached: false, transactionFailure: "none", arrive: null as null | (() => Promise<void>) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/audit", async original => {
  const actual = await original<typeof import("@/lib/services/audit")>();
  return { ...actual, logAudit: async (...args: Parameters<typeof actual.logAudit>) => {
    const result = await actual.logAudit(...args);
    if (controls.failAudit) { controls.auditReached = true; throw new Error("Fixture post-insert failure"); }
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
            if (member === "booking") return new Proxy(transaction.booking, {
              get(model, operation) {
                if (operation === "updateMany") return async (args: Prisma.BookingUpdateManyArgs) => {
                  const result = await model.updateMany(args);
                  if (controls.failParent) { controls.parentReached = true; throw new Error("Fixture post-parent-write failure"); }
                  return result;
                };
                const value = Reflect.get(model, operation);
                return typeof value === "function" ? value.bind(model) : value;
              },
            });
            if (member !== "availedService") return Reflect.get(transaction, member);
            return new Proxy(transaction.availedService, {
              get(model, operation) {
                if (operation === "findFirst") return async (args: Prisma.AvailedServiceFindFirstArgs) => {
                  const result = await model.findFirst(args);
                  if (args.select?.booking && controls.arrive) await controls.arrive();
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
const factory = createSharedWorkflowFactory({ namespace: "integration-owner-queue-claims", now: date });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const tenants = [business.id, foreign.id];
const users = Array.from({ length: 2 }, (_, i) => factory.user({ id: `${business.id}-owner-${i}`, contactNumber: `test-owner-queue-${i}` }));
const customers = tenants.map((businessId, i) => factory.customer({ id: `${business.id}-customer-${i}`, businessId }));
const owners: number[] = [];
const services: number[] = [];
let packageId: number;
let bookingId: number;
let targetId: number;
let context: Parameters<typeof claimOwnerService>[0];
const target = () => prisma.availedService.findUniqueOrThrow({ where: { id: targetId } });
const auditCount = () => prisma.auditLog.count({ where: { business_id: { in: tenants } } });
async function cleanup() {
  try { await prisma.auditLog.deleteMany({ where: { business_id: { in: tenants } } }); }
  finally {
    try { await prisma.business.deleteMany({ where: { id: { in: tenants } } }); }
    finally { await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); }
  }
}
async function concurrent(work: () => Promise<unknown[]>) {
  let arrivals = 0; let release!: () => void; let timeout: ReturnType<typeof setTimeout> | undefined;
  const gate = new Promise<void>((resolve, reject) => { release = resolve; timeout = setTimeout(() => reject(new Error("Fixture requires two transaction connections")), 5000); });
  controls.arrive = async () => { if (++arrivals === 2) { clearTimeout(timeout); release(); } await gate; };
  try { const results = await work(); expect(arrivals).toBe(2); return results; }
  finally { controls.arrive = null; clearTimeout(timeout); }
}
describe("owner queue claims in isolated PostgreSQL", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(date);
    await cleanup();
    for (const tenant of [business, foreign]) await prisma.business.create({ data: { id: tenant.id, slug: tenant.slug, name: tenant.name, initials: tenant.initials } });
    for (const fixture of users) {
      await prisma.user.create({ data: { id: fixture.id, contact_number: fixture.contactNumber, name: fixture.name, hashed_password: fixture.hashedPassword, role: "OWNER" } });
      owners.push((await prisma.owner.create({ data: { business_id: business.id, user_id: fixture.id } })).id);
    }
    for (const fixture of customers) await prisma.customer.create({ data: { id: fixture.id, name: fixture.name, email: fixture.email, phone: fixture.phone, business_id: fixture.businessId } });
    for (const businessId of tenants) {
      const fixture = factory.service({ businessId, price: 100 });
      services.push((await prisma.service.create({ data: { business_id: businessId, name: fixture.name, category: fixture.category, price: fixture.price, duration: fixture.duration } })).id);
    }
    packageId = (await prisma.servicePackage.create({ data: { business_id: foreign.id, name: "Foreign fixture", category: "GENERAL", price: 100 } })).id;
    const fixture = factory.booking({ grandTotal: 100 });
    bookingId = (await prisma.booking.create({ data: { business_id: business.id, customer_id: customers[0].id, scheduled_at: fixture.scheduledAt, estimated_end: fixture.estimatedEnd, grand_total: fixture.grandTotal, total_discount: 0 } })).id;
    targetId = (await prisma.availedService.create({ data: { booking_id: bookingId, service_id: services[0], price: 100, final_price: 100, commission_base: 100, scheduled_at: fixture.scheduledAt, estimated_end: fixture.estimatedEnd } })).id;
    context = { success: true, actorType: "OWNER", role: "OWNER", ownerId: owners[0], userId: users[0].id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
  });
  beforeEach(async () => {
    controls.failAudit = false; controls.auditReached = false; controls.failParent = false; controls.parentReached = false; controls.arrive = null; controls.transactionFailure = "none";
    await prisma.auditLog.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.saleEvent.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.user.updateMany({ where: { id: { in: users.map(user => user.id) } }, data: { role: "OWNER" } });
    await prisma.owner.updateMany({ where: { id: { in: owners } }, data: { business_id: business.id } });
    await prisma.customer.updateMany({ where: { id: { in: customers.map(customer => customer.id) } }, data: { trust_tier: "NEW" } });
    await prisma.booking.update({ where: { id: bookingId }, data: { business_id: business.id, customer_id: customers[0].id, status: "ACCEPTED", cancelled_at: null, is_anonymous_walk_in: false, customer_label: null, payment_status: "UNPAID", amount_paid: 0 } });
    await prisma.availedService.update({ where: { id: targetId }, data: { status: "PENDING", service_id: services[0], package_id: null, price: 100, final_price: 100, discount: 0, discount_reason: null, commission_base: 100, served_by_id: null, served_by_owner_id: null, served_by_type: null, claimed_at: null, served_at: null, completed_at: null, cancelled_at: null } });
  });
  afterAll(async () => {
    controls.failAudit = false; controls.failParent = false; controls.arrive = null;
    try { await cleanup(); } finally { vi.useRealTimers(); await prisma.$disconnect(); }
  });
  it("commits claim, serving unclaim and both verified audits", async () => {
    const result = await claimOwnerService(context, targetId);
    expect(result, `Transaction failure: ${controls.transactionFailure}`).toEqual({ success: true });
    expect(await target()).toMatchObject({ status: "CLAIMED", served_by_owner_id: owners[0], served_by_type: "OWNER", final_price: 100 });
    await prisma.availedService.update({ where: { id: targetId }, data: { status: "SERVING", served_at: date } });
    expect(await unclaimOwnerService(context, targetId)).toEqual({ success: true });
    expect(await target()).toMatchObject({ status: "PENDING", served_by_owner_id: null, served_by_id: null, served_by_type: null, claimed_at: null, served_at: null, final_price: 100 });
    expect(await auditCount()).toBe(2);
    expect(await prisma.auditLog.count({ where: { business_id: business.id, actor_id: users[0].id, entity_id: String(targetId) } })).toBe(2);
  });
  it("rolls back a real claim and inserted audit on post-insert failure", async () => {
    controls.failAudit = true;
    expect(await claimOwnerService(context, targetId)).toEqual({ success: false, error: "Unable to claim service." });
    expect(controls.auditReached).toBe(true); expect(await target()).toMatchObject({ status: "PENDING", served_by_owner_id: null }); expect(await auditCount()).toBe(0);
  });
  it.each(["role", "membership"])("denies %s revoked after context resolution", async revoked => {
    if (revoked === "role") await prisma.user.update({ where: { id: users[0].id }, data: { role: "EMPLOYEE" } });
    else await prisma.owner.update({ where: { id: owners[0] }, data: { business_id: foreign.id } });
    expect(await claimOwnerService(context, targetId)).toEqual({ success: false, error: "Owner not found" }); expect(await target()).toMatchObject({ status: "PENDING" }); expect(await auditCount()).toBe(0);
  });
  it.each(["booking", "customer", "service", "package"])("denies a foreign %s reference without an existence oracle or write", async reference => {
    if (reference === "booking") await prisma.booking.update({ where: { id: bookingId }, data: { business_id: foreign.id } });
    if (reference === "customer") await prisma.booking.update({ where: { id: bookingId }, data: { customer_id: customers[1].id } });
    if (reference === "service") await prisma.availedService.update({ where: { id: targetId }, data: { service_id: services[1] } });
    if (reference === "package") await prisma.availedService.update({ where: { id: targetId }, data: { package_id: packageId } });
    expect(await claimOwnerService(context, targetId)).toEqual({ success: false, error: "Service not found." }); expect(await unclaimOwnerService(context, targetId)).toEqual({ success: false, error: "Service not found." });
    expect(await target()).toMatchObject({ status: "PENDING", served_by_owner_id: null }); expect(await auditCount()).toBe(0);
  });
  it.each(["COMPLETED", "CANCELLED", "PENDING"] as const)("does not reset %s work through unclaim", async status => {
    await prisma.availedService.update({ where: { id: targetId }, data: { status, served_by_owner_id: owners[0], served_by_type: "OWNER" } });
    expect(await unclaimOwnerService(context, targetId)).toEqual({ success: false, error: "Unable to unclaim service." }); expect((await target()).status).toBe(status); expect(await auditCount()).toBe(0);
  });
  it("retains anonymous walk-in claim support without a customer reference", async () => {
    await prisma.booking.update({ where: { id: bookingId }, data: { customer_id: null, is_anonymous_walk_in: true, customer_label: "Fixture walk-in" } });
    expect(await claimOwnerService(context, targetId)).toEqual({ success: true }); expect(await auditCount()).toBe(1);
  });
  it("keeps anonymous walk-ins visible in pending and self-owner claimed queues", async () => {
    await prisma.booking.update({ where: { id: bookingId }, data: { customer_id: null, is_anonymous_walk_in: true, customer_label: "Fixture walk-in" } });
    expect(await getTenantPendingServiceQueue(context)).toEqual([expect.objectContaining({ id: targetId, booking: expect.objectContaining({ customer: null }) })]);
    expect((await claimOwnerService(context, targetId)).success).toBe(true);
    expect(await getTenantOwnerClaimedServiceQueue(context)).toEqual([expect.objectContaining({ id: targetId, booking: expect.objectContaining({ customer: null }) })]);
  });
  it("reads active sale references and pricing from the same real transaction", async () => {
    await prisma.saleEvent.create({ data: { business_id: business.id, title: "Fixture sale", discount_type: "PERCENTAGE", discount_value: 20, start_date: date, end_date: new Date(date.getTime() + 86400000), applicable_services: { connect: { id: services[0] } } } });
    expect(await claimOwnerService(context, targetId)).toEqual({ success: true }); expect(await target()).toMatchObject({ final_price: 80, discount: 20, discount_reason: "Fixture sale", commission_base: 80 }); expect(await auditCount()).toBe(1);
  });
  it("allows only one competing owner claim from the same stored snapshot", async () => {
    const second = { ...context, ownerId: owners[1], userId: users[1].id };
    const results = await concurrent(() => Promise.all([claimOwnerService(context, targetId), claimOwnerService(second, targetId)]));
    expect(results.filter(result => (result as { success: boolean }).success)).toHaveLength(1); expect(await auditCount()).toBe(1);
    expect(results.find(result => !(result as { success: boolean }).success)).toEqual({ success: false, error: "Service already claimed or not found." });
    expect((await target()).served_by_owner_id).toBe(owners[results.findIndex(result => (result as { success: boolean }).success)]);
  }, 15000);
  it("allows only one simultaneous unclaim from the same owner assignment", async () => {
    expect((await claimOwnerService(context, targetId)).success).toBe(true);
    await prisma.auditLog.deleteMany({ where: { business_id: business.id } });
    const results = await concurrent(() => Promise.all([unclaimOwnerService(context, targetId), unclaimOwnerService(context, targetId)]));
    expect(results.filter(result => (result as { success: boolean }).success)).toHaveLength(1); expect(await target()).toMatchObject({ status: "PENDING", served_by_owner_id: null }); expect(await auditCount()).toBe(1);
    expect(results.find(result => !(result as { success: boolean }).success)).toEqual({ success: false, error: "Unable to unclaim service." });
  }, 15000);
  async function assigned(completed = false) {
    await prisma.availedService.update({ where: { id: targetId }, data: { status: completed ? "COMPLETED" : "CLAIMED", served_by_owner_id: owners[0], served_by_type: "OWNER", claimed_at: date, served_at: completed ? date : null, completed_at: completed ? date : null } });
  }
  const parent = () => prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const customer = () => prisma.customer.findUniqueOrThrow({ where: { id: customers[0].id } });
  it("atomically serves, promotes unpaid booking and trust, then undoes without reversing payment/trust", async () => {
    await assigned();
    const served = await serveOwnerService(context, targetId);
    expect(served).toMatchObject({ success: true, data: { id: targetId, status: "COMPLETED", served_by_owner_id: owners[0], served_at: expect.any(Date), completed_at: expect.any(Date), final_price: 100 } });
    expect(await parent()).toMatchObject({ status: "COMPLETED", payment_status: "UNPAID", amount_paid: 0 }); expect((await customer()).trust_tier).toBe("TRUSTED");
    expect(await auditCount()).toBe(2);
    expect(await undoOwnerServiceServing(context, targetId)).toMatchObject({ success: true, data: { status: "CLAIMED", served_at: null, completed_at: null, served_by_owner_id: owners[0] } });
    expect(await parent()).toMatchObject({ status: "ACCEPTED", payment_status: "UNPAID", amount_paid: 0 }); expect((await customer()).trust_tier).toBe("TRUSTED");
    expect(await auditCount()).toBe(4); expect(await prisma.bookingPayment.count({ where: { booking_id: bookingId } })).toBe(0);
  });
  it("does not promote a parent while another line is pending; undo leaves an accepted parent unchanged", async () => {
    await assigned();
    const second = await prisma.availedService.create({ data: { booking_id: bookingId, service_id: services[0], price: 100, final_price: 100, commission_base: 100 } });
    try {
      expect((await serveOwnerService(context, targetId)).success).toBe(true); expect((await parent()).status).toBe("ACCEPTED"); expect((await customer()).trust_tier).toBe("NEW");
      expect((await undoOwnerServiceServing(context, targetId)).success).toBe(true); expect((await parent()).status).toBe("ACCEPTED"); expect(await auditCount()).toBe(2);
    } finally { await prisma.availedService.deleteMany({ where: { id: second.id, booking_id: bookingId } }); }
  });
  it("supports anonymous walk-in serving and undo without customer promotion", async () => {
    await assigned(); await prisma.booking.update({ where: { id: bookingId }, data: { customer_id: null, is_anonymous_walk_in: true, customer_label: "Fixture walk-in" } });
    expect((await serveOwnerService(context, targetId)).success).toBe(true); expect((await parent()).status).toBe("COMPLETED");
    expect((await undoOwnerServiceServing(context, targetId)).success).toBe(true); expect((await parent()).status).toBe("ACCEPTED"); expect(await auditCount()).toBe(4);
  });
  it.each(["serve", "undo"])("rolls back real service and parent writes when %s parent write fails", async mode => {
    await assigned(mode === "undo");
    if (mode === "undo") await prisma.booking.update({ where: { id: bookingId }, data: { status: "COMPLETED" } });
    const before = await target(); const parentBefore = await parent();
    controls.failParent = true;
    expect(await (mode === "serve" ? serveOwnerService : undoOwnerServiceServing)(context, targetId)).toEqual({ success: false, error: mode === "serve" ? "Unable to mark as served." : "Unable to unserve." });
    expect(controls.parentReached).toBe(true); expect(await target()).toEqual(before); expect(await parent()).toEqual(parentBefore); expect(await auditCount()).toBe(0); expect((await customer()).trust_tier).toBe("NEW");
  });
  it("rolls back real service, parent, customer trust and inserted audit on serve audit failure", async () => {
    await assigned(); const before = await target(); const parentBefore = await parent();
    controls.failAudit = true;
    expect(await serveOwnerService(context, targetId)).toEqual({ success: false, error: "Unable to mark as served." });
    expect(controls.auditReached).toBe(true); expect(await target()).toEqual(before); expect(await parent()).toEqual(parentBefore); expect((await customer()).trust_tier).toBe("NEW"); expect(await auditCount()).toBe(0);
  });
  it("rolls back a completed service and parent reopen on undo audit failure", async () => {
    await assigned(true); await prisma.booking.update({ where: { id: bookingId }, data: { status: "COMPLETED" } });
    const before = await target(); const parentBefore = await parent(); controls.failAudit = true;
    expect(await undoOwnerServiceServing(context, targetId)).toEqual({ success: false, error: "Unable to unserve." });
    expect(controls.auditReached).toBe(true); expect(await target()).toEqual(before); expect(await parent()).toEqual(parentBefore); expect(await auditCount()).toBe(0);
  });
  it.each(["role", "membership"])("denies %s revoked after context resolution for serve and undo", async revoked => {
    await assigned();
    if (revoked === "role") await prisma.user.update({ where: { id: users[0].id }, data: { role: "EMPLOYEE" } });
    else await prisma.owner.update({ where: { id: owners[0] }, data: { business_id: foreign.id } });
    expect(await serveOwnerService(context, targetId)).toEqual({ success: false, error: "Owner not found" });
    expect(await undoOwnerServiceServing(context, targetId)).toEqual({ success: false, error: "Owner not found" }); expect((await target()).status).toBe("CLAIMED"); expect(await auditCount()).toBe(0);
  });
  it.each(["booking", "customer", "service", "package"])("denies foreign %s references for serve and undo without writes", async reference => {
    await assigned();
    if (reference === "booking") await prisma.booking.update({ where: { id: bookingId }, data: { business_id: foreign.id } });
    if (reference === "customer") await prisma.booking.update({ where: { id: bookingId }, data: { customer_id: customers[1].id } });
    if (reference === "service") await prisma.availedService.update({ where: { id: targetId }, data: { service_id: services[1] } });
    if (reference === "package") await prisma.availedService.update({ where: { id: targetId }, data: { package_id: packageId } });
    expect(await serveOwnerService(context, targetId)).toEqual({ success: false, error: "Unable to mark as served." });
    expect(await undoOwnerServiceServing(context, targetId)).toEqual({ success: false, error: "Unable to unserve." }); expect((await target()).status).toBe("CLAIMED"); expect(await auditCount()).toBe(0);
  });
  it.each(["owner", "provider", "cancelled-service", "cancelled-parent"])("denies %s inconsistent serve and undo edges", async mode => {
    await assigned();
    if (mode === "owner") await prisma.availedService.update({ where: { id: targetId }, data: { served_by_owner_id: owners[1] } });
    if (mode === "provider") await prisma.availedService.update({ where: { id: targetId }, data: { served_by_type: "EMPLOYEE" } });
    if (mode === "cancelled-service") await prisma.availedService.update({ where: { id: targetId }, data: { cancelled_at: date } });
    if (mode === "cancelled-parent") await prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelled_at: date } });
    expect(await serveOwnerService(context, targetId)).toEqual({ success: false, error: "Unable to mark as served." });
    expect(await undoOwnerServiceServing(context, targetId)).toEqual({ success: false, error: "Unable to unserve." }); expect(await auditCount()).toBe(0);
  });
  it("rejects repeated serve and repeated undo without new writes/audits", async () => {
    await assigned(); expect((await serveOwnerService(context, targetId)).success).toBe(true);
    const served = await target(); expect(await serveOwnerService(context, targetId)).toEqual({ success: false, error: "Unable to mark as served." }); expect(await target()).toEqual(served); expect(await auditCount()).toBe(2);
    expect((await undoOwnerServiceServing(context, targetId)).success).toBe(true);
    const undone = await target(); expect(await undoOwnerServiceServing(context, targetId)).toEqual({ success: false, error: "Unable to unserve." }); expect(await target()).toEqual(undone); expect(await auditCount()).toBe(4);
  });
  it("allows only one simultaneous owner serve from the same active snapshot", async () => {
    await assigned();
    const results = await concurrent(() => Promise.all([serveOwnerService(context, targetId), serveOwnerService(context, targetId)]));
    expect(results.filter(result => (result as { success: boolean }).success)).toHaveLength(1); expect(await auditCount()).toBe(2); expect((await target()).status).toBe("COMPLETED"); expect((await parent()).status).toBe("COMPLETED");
    expect(results.find(result => !(result as { success: boolean }).success)).toEqual({ success: false, error: "Unable to mark as served." });
  }, 15000);
  it("allows only one simultaneous undo from the same completed snapshot", async () => {
    await assigned(true); await prisma.booking.update({ where: { id: bookingId }, data: { status: "COMPLETED" } });
    const results = await concurrent(() => Promise.all([undoOwnerServiceServing(context, targetId), undoOwnerServiceServing(context, targetId)]));
    expect(results.filter(result => (result as { success: boolean }).success)).toHaveLength(1); expect(await auditCount()).toBe(2); expect((await target()).status).toBe("CLAIMED"); expect((await parent()).status).toBe("ACCEPTED");
    expect(results.find(result => !(result as { success: boolean }).success)).toEqual({ success: false, error: "Unable to unserve." });
  }, 15000);
  it("serializes owner serve against unclaim without serving a lost assignment", async () => {
    await assigned();
    const results = await concurrent(() => Promise.all([serveOwnerService(context, targetId), unclaimOwnerService(context, targetId)]));
    expect(results.filter(result => (result as { success: boolean }).success)).toHaveLength(1);
    if ((results[0] as { success: boolean }).success) {
      expect(await target()).toMatchObject({ status: "COMPLETED", served_by_owner_id: owners[0] }); expect((await parent()).status).toBe("COMPLETED"); expect(await auditCount()).toBe(2);
    } else {
      expect(await target()).toMatchObject({ status: "PENDING", served_by_owner_id: null }); expect((await parent()).status).toBe("ACCEPTED"); expect(await auditCount()).toBe(1);
    }
  }, 15000);
});
