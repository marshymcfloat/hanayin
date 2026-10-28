import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { createTenantVoucher, deleteTenantVoucher } from "@/features/catalog/services/voucher-administration";
import { listTenantVouchers, verifyPublicVoucher } from "@/features/catalog/queries/voucher-administration";
import type { VoucherActorContext } from "@/features/catalog/voucher-access";
import { Role, StaffProfile } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

vi.mock("server-only", () => ({}));
requireTestDatabase();

const namespace = `integration-voucher-${randomUUID()}`;
const factory = createSharedWorkflowFactory({ namespace });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const ownerUser = factory.user({ contactNumber: `test-voucher-owner-${randomUUID()}` });
const staffUser = factory.user({ id: `${ownerUser.id}-staff`, role: "EMPLOYEE", contactNumber: `test-voucher-staff-${randomUUID()}` });
const tenantIds = [business.id, foreign.id];
const now = new Date("2030-01-15T09:00:00.000Z");
const input = (suffix = "own") => ({ code: `${namespace}-${suffix}`.toUpperCase(), type: "PERCENTAGE" as const, value: 20, minimum_amount: 100, expires_at: new Date(now.getTime() + 1000) });
let owner: VoucherActorContext;
let staff: VoucherActorContext;

describe("voucher administration and advisory verification in PostgreSQL", () => {
  beforeAll(async () => {
    for (const fixture of [business, foreign]) await prisma.business.create({ data: { id: fixture.id, slug: fixture.slug, name: fixture.name, initials: fixture.initials } });
    for (const fixture of [ownerUser, staffUser]) await prisma.user.create({ data: { id: fixture.id, contact_number: fixture.contactNumber, name: fixture.name, hashed_password: fixture.hashedPassword, role: fixture.role } });
    const membership = await prisma.owner.create({ data: { user_id: ownerUser.id, business_id: business.id } });
    const employee = await prisma.employee.create({ data: { user_id: staffUser.id, business_id: business.id, salary: 0, profile: StaffProfile.STAFF } });
    const businessPolicy = { structure: "OWNER_EMPLOYEE_SELF_SERVICE" as const, allowEmployeeSelfBooking: true, managerCanServe: true };
    owner = { success: true, actorType: "OWNER", role: Role.OWNER, ownerId: membership.id, userId: ownerUser.id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy };
    staff = { ...owner, actorType: "EMPLOYEE", role: Role.EMPLOYEE, ownerId: null, employeeId: employee.id, userId: staffUser.id, profile: StaffProfile.STAFF };
  });
  beforeEach(async () => {
    await prisma.voucher.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.booking.deleteMany({ where: { business_id: { in: tenantIds } } });
    await prisma.user.update({ where: { id: ownerUser.id }, data: { role: Role.OWNER } });
    await prisma.user.update({ where: { id: staffUser.id }, data: { role: Role.EMPLOYEE } });
    await prisma.owner.update({ where: { id: owner.ownerId! }, data: { business_id: business.id } });
    await prisma.employee.update({ where: { id: staff.employeeId! }, data: { business_id: business.id } });
  });
  afterAll(async () => {
    let failures = 0;
    try {
      for (const cleanup of [
        () => prisma.voucher.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.booking.deleteMany({ where: { business_id: { in: tenantIds } } }),
        () => prisma.business.deleteMany({ where: { id: { in: tenantIds } } }),
        () => prisma.user.deleteMany({ where: { id: { in: [ownerUser.id, staffUser.id] } } }),
      ]) { try { await cleanup(); } catch { failures++; } }
    } finally { await prisma.$disconnect(); }
    if (failures) throw new Error(`Fixture cleanup failed in ${failures} steps`);
  });

  it.each(["owner", "staff"])("creates a tenant voucher for current %s", async actor => {
    const created = await createTenantVoucher(actor === "owner" ? owner : staff, input());
    expect(created).toMatchObject({ ...input(), business_id: business.id, is_active: true, used_by_id: null });
    expect(await prisma.voucher.findUniqueOrThrow({ where: { id: created.id } })).toEqual(created);
  });
  it("preserves global code uniqueness without creating a tenant duplicate", async () => {
    const prior = await prisma.voucher.create({ data: { ...input(), business_id: foreign.id } });
    await expect(createTenantVoucher(owner, input())).rejects.toThrow("Voucher code already exists");
    expect(await prisma.voucher.count({ where: { business_id: business.id } })).toBe(0);
    expect(await prisma.voucher.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
  });
  it("rejects deletion of a foreign voucher without changing it", async () => {
    const prior = await prisma.voucher.create({ data: { ...input(), business_id: foreign.id } });
    await expect(deleteTenantVoucher(owner, prior.id)).rejects.toThrow();
    expect(await prisma.voucher.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
  });
  it("deletes only the current tenant target", async () => {
    const own = await createTenantVoucher(staff, input());
    const other = await prisma.voucher.create({ data: { ...input("foreign"), business_id: foreign.id } });
    await deleteTenantVoucher(owner, own.id);
    expect(await prisma.voucher.findUnique({ where: { id: own.id } })).toBeNull();
    expect(await prisma.voucher.findUniqueOrThrow({ where: { id: other.id } })).toEqual(other);
  });
  it.each(["owner", "staff"])("denies stale %s role on creation and deletion", async actor => {
    const context = actor === "owner" ? owner : staff;
    const prior = await createTenantVoucher(context, input());
    await prisma.user.update({ where: { id: context.userId }, data: { role: Role.PLATFORM_ADMIN } });
    await expect(createTenantVoucher(context, input("new"))).rejects.toThrow();
    await expect(deleteTenantVoucher(context, prior.id)).rejects.toThrow();
    expect(await prisma.voucher.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
    expect(await prisma.voucher.count({ where: { business_id: business.id } })).toBe(1);
    expect(await listTenantVouchers(context)).toEqual([]);
  });
  it.each(["owner", "staff"])("denies transferred %s membership on reads and writes", async actor => {
    const context = actor === "owner" ? owner : staff;
    const prior = await createTenantVoucher(context, input());
    if (actor === "owner") await prisma.owner.update({ where: { id: owner.ownerId! }, data: { business_id: foreign.id } });
    else await prisma.employee.update({ where: { id: staff.employeeId! }, data: { business_id: foreign.id } });
    await expect(createTenantVoucher(context, input("new"))).rejects.toThrow();
    await expect(deleteTenantVoucher(context, prior.id)).rejects.toThrow();
    expect(await listTenantVouchers(context)).toEqual([]);
    expect(await prisma.voucher.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
  });
  it("uses inclusive expiry and never reserves a publicly verified voucher", async () => {
    const prior = await createTenantVoucher(owner, { ...input(), expires_at: now });
    expect(await verifyPublicVoucher(prior.code, business.slug, 200, now)).toMatchObject({ success: true, data: { id: prior.id, discountAmount: 40, finalPrice: 160 } });
    expect(await verifyPublicVoucher(prior.code, business.slug, 200, new Date(now.getTime() + 1))).toEqual({ success: false, error: "Voucher has expired" });
    expect(await prisma.voucher.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
  });
  it("retains inactive, used and minimum-spend denial", async () => {
    const prior = await createTenantVoucher(owner, input());
    expect(await verifyPublicVoucher(prior.code, business.slug, 99, now)).toEqual({ success: false, error: "Minimum spend of 100 required" });
    await prisma.voucher.update({ where: { id: prior.id }, data: { is_active: false } });
    expect(await verifyPublicVoucher(prior.code, business.slug, 200, now)).toEqual({ success: false, error: "Voucher is inactive" });
    const booking = await prisma.booking.create({ data: { business_id: business.id, customer_id: null, grand_total: 0, total_discount: 0 } });
    await prisma.voucher.update({ where: { id: prior.id }, data: { is_active: true, used_by_id: booking.id } });
    expect(await verifyPublicVoucher(prior.code, business.slug, 200, now)).toEqual({ success: false, error: "Voucher has already been used" });
  });
  it("preserves the foreign-business public error without returning foreign data", async () => {
    const prior = await prisma.voucher.create({ data: { ...input(), business_id: foreign.id } });
    expect(await verifyPublicVoucher(prior.code, business.slug, 200, now)).toEqual({ success: false, error: "Invalid voucher for this business" });
  });
  it("does not expose a legacy foreign booking linked through used_by", async () => {
    const booking = await prisma.booking.create({ data: { business_id: foreign.id, customer_id: null, grand_total: 0, total_discount: 0 } });
    const own = await prisma.voucher.create({ data: { ...input(), business_id: business.id, used_by_id: booking.id } });
    const rows = await listTenantVouchers(owner);
    expect(rows).toEqual([expect.objectContaining({ id: own.id, used_by: null })]);
    expect(await verifyPublicVoucher(own.code, business.slug, 200, now)).toEqual({ success: false, error: "Voucher has already been used" });
  });
  it.each(["FLAT", "PERCENTAGE"] as const)("clamps valid %s discount without mutation", async type => {
    const prior = await createTenantVoucher(owner, { ...input(), type, value: type === "FLAT" ? 500 : 100 });
    expect(await verifyPublicVoucher(prior.code, business.slug, 200, now)).toMatchObject({ success: true, data: { discountAmount: 200, finalPrice: 0 } });
    expect(await prisma.voucher.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior);
  });
});
