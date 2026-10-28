import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { createTenantCustomer, updateTenantCustomer, deleteTenantCustomer } from "@/features/customers/services/customer-administration";
import { searchTenantCustomers, getTenantCustomerHistory } from "@/features/customers/queries/customer-administration";
import type { CustomerActorContext } from "@/features/customers/customer-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { Role, StaffProfile } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ missingReload: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, {
    get(client, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) =>
        client.$transaction(tx => work(new Proxy(tx, {
          get(transaction, member) {
            const delegate = Reflect.get(transaction, member);
            if (member !== "customer") return delegate;
            return new Proxy(delegate, {
              get(model, operation) {
                const value = Reflect.get(model, operation);
                if (typeof value !== "function") return value;
                return async (...args: unknown[]) => {
                  const result = await value.apply(model, args);
                  return operation === "findFirst" && controls.missingReload ? null : result;
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

const factory = createSharedWorkflowFactory({ namespace: `integration-customers-${randomUUID()}` });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const ownerUser = factory.user({ contactNumber: `test-customer-owner-${randomUUID()}` });
const staffUser = factory.user({ id: `${ownerUser.id}-staff`, role: "EMPLOYEE", contactNumber: `test-customer-staff-${randomUUID()}` });
const tenantIds = [business.id, foreign.id];
let owner: CustomerActorContext;
let staff: CustomerActorContext;
const input = { name: "Fixture Customer", email: "fixture@example.test", phone: "639170000003" };

describe("current-tenant customer administration in PostgreSQL", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-15T09:00:00.000Z"));
    for (const fixture of [business, foreign]) await prisma.business.create({ data: { id: fixture.id, slug: fixture.slug, name: fixture.name, initials: fixture.initials } });
    for (const fixture of [ownerUser, staffUser]) await prisma.user.create({ data: { id: fixture.id, contact_number: fixture.contactNumber, name: fixture.name, hashed_password: fixture.hashedPassword, role: fixture.role } });
    const membership = await prisma.owner.create({ data: { user_id: ownerUser.id, business_id: business.id } });
    const employee = await prisma.employee.create({ data: { user_id: staffUser.id, business_id: business.id, salary: 0, profile: StaffProfile.STAFF } });
    const businessPolicy = { structure: "OWNER_EMPLOYEE_SELF_SERVICE" as const, allowEmployeeSelfBooking: true, managerCanServe: true };
    owner = { success: true, actorType: "OWNER", role: Role.OWNER, ownerId: membership.id, userId: ownerUser.id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy };
    staff = { ...owner, actorType: "EMPLOYEE", role: Role.EMPLOYEE, ownerId: null, employeeId: employee.id, userId: staffUser.id, profile: StaffProfile.STAFF };
  });
  beforeEach(async () => {
    controls.missingReload = false;
    await prisma.booking.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.customer.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.user.update({ where: { id: ownerUser.id }, data: { role: Role.OWNER } });
    await prisma.user.update({ where: { id: staffUser.id }, data: { role: Role.EMPLOYEE } });
    await prisma.owner.update({ where: { id: owner.ownerId! }, data: { business_id: business.id } });
    await prisma.employee.update({ where: { id: staff.employeeId! }, data: { business_id: business.id } });
  });
  afterAll(async () => {
    controls.missingReload = false;
    let failures = 0;
    try {
      for (const cleanup of [
        () => prisma.booking.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.customer.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.business.deleteMany({ where: { id: { in: tenantIds } } }),
        () => prisma.user.deleteMany({ where: { id: { in: [ownerUser.id, staffUser.id] } } }),
      ]) { try { await cleanup(); } catch { failures++; } }
    } finally {
      try { await prisma.$disconnect(); } finally { vi.useRealTimers(); }
    }
    if (failures) throw new Error(`Fixture cleanup failed in ${failures} steps`);
  });

  it.each(["owner", "staff"])("creates supported customer scalars for current %s", async actor => {
    const created = await createTenantCustomer(actor === "owner" ? owner : staff, input);
    expect(created).toMatchObject({ ...input, business_id: business.id, trust_tier: "NEW", no_show_count: 0 });
    expect(Object.keys(created).sort()).toEqual(["id", "name", "email", "phone", "trust_tier", "no_show_count", "last_no_show_at", "business_id", "is_demo", "created_at", "updated_at"].sort());
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: created.id } })).toEqual(created);
  });

  it("retains omitted contacts during update and reloads the tenant result", async () => {
    const prior = await createTenantCustomer(owner, input);
    const updated = await updateTenantCustomer(staff, prior.id, { name: "Changed" });
    expect(updated).toMatchObject({ id: prior.id, business_id: business.id, name: "Changed", email: input.email, phone: input.phone });
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(updated);
  });

  it("rolls the real update back when the post-write reload fails", async () => {
    const prior = await createTenantCustomer(owner, input);
    controls.missingReload = true;
    await expect(updateTenantCustomer(owner, prior.id, { name: "Must roll back" })).rejects.toThrow("Failed to load updated customer");
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
  });

  it("preserves explicitly empty contact replacements", async () => {
    const prior = await createTenantCustomer(owner, input);
    const updated = await updateTenantCustomer(staff, prior.id, { name: "Changed", email: "", phone: "" });
    expect(updated).toMatchObject({ id: prior.id, email: "", phone: "" });
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(updated);
  });

  it("denies foreign updates and deletes without changing their record", async () => {
    const prior = await prisma.customer.create({ data: { ...input, business_id: foreign.id } });
    await expect(updateTenantCustomer(owner, prior.id, { name: "Must not change" })).rejects.toThrow("Customer not found or unauthorized");
    await expect(deleteTenantCustomer(staff, prior.id)).rejects.toThrow("Customer not found or unauthorized");
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
  });

  it.each(["owner", "staff"])("denies writes after current %s role is revoked", async actor => {
    const context = actor === "owner" ? owner : staff;
    const prior = await createTenantCustomer(context, input);
    await prisma.user.update({ where: { id: context.userId }, data: { role: Role.PLATFORM_ADMIN } });
    await expect(createTenantCustomer(context, input)).rejects.toThrow("Forbidden");
    await expect(updateTenantCustomer(context, prior.id, { name: "Denied" })).rejects.toThrow("Customer not found or unauthorized");
    await expect(deleteTenantCustomer(context, prior.id)).rejects.toThrow("Customer not found or unauthorized");
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
    expect(await prisma.customer.count({ where: { business_id: business.id } })).toBe(1);
  });

  it("deletes the tenant customer while preserving a foreign customer", async () => {
    const created = await createTenantCustomer(owner, input);
    const prior = await prisma.customer.create({ data: { ...input, business_id: foreign.id } });
    await deleteTenantCustomer(staff, created.id);
    expect(await prisma.customer.findUnique({ where: { id: created.id } })).toBeNull();
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
  });

  it.each(["owner", "staff"])("denies writes and reads after %s membership moves to a different tenant", async actor => {
    const context = actor === "owner" ? owner : staff;
    const prior = await createTenantCustomer(context, input);
    if (actor === "owner") await prisma.owner.update({ where: { id: owner.ownerId! }, data: { business_id: foreign.id } });
    else await prisma.employee.update({ where: { id: staff.employeeId! }, data: { business_id: foreign.id } });
    await expect(createTenantCustomer(context, input)).rejects.toThrow("Forbidden");
    await expect(updateTenantCustomer(context, prior.id, { name: "Denied" })).rejects.toThrow("Customer not found or unauthorized");
    await expect(deleteTenantCustomer(context, prior.id)).rejects.toThrow("Customer not found or unauthorized");
    expect(await searchTenantCustomers(context, "Fixture")).toEqual({ success: true, data: [] });
    expect(await getTenantCustomerHistory(context, prior.id)).toEqual({ success: false, error: "Customer not found" });
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
  });

  it("excludes legacy foreign bookings from search metadata and history", async () => {
    const created = await createTenantCustomer(owner, input);
    const ownDate = new Date("2030-01-16T09:00:00.000Z");
    const ownBooking = await prisma.booking.create({ data: { business_id: business.id, customer_id: created.id, grand_total: 100, total_discount: 0, scheduled_at: ownDate } });
    await prisma.booking.create({ data: { business_id: foreign.id, customer_id: created.id, grand_total: 900, total_discount: 0, scheduled_at: new Date("2031-01-16T09:00:00.000Z") } });
    expect(await searchTenantCustomers(staff, "Fixture")).toMatchObject({ success: true, data: [{ id: created.id, lastBookingAt: ownDate }] });
    const history = await getTenantCustomerHistory(owner, created.id);
    expect(history.success).toBe(true);
    if (!history.success) throw new Error("Fixture history failed");
    expect(history.data.bookings.map(booking => booking.id)).toEqual([ownBooking.id]);
    expect(history.data.nextAppointment?.bookingId).toBe(ownBooking.id);
    expect(history.data.flowStatus).toEqual([]);
  });
});
