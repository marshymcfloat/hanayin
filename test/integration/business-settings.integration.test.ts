import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { saveBookingPolicy } from "@/features/bookings/services/booking-policy";
import { saveBusinessHours } from "@/features/businesses/services/business-hours";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import { OwnerPermission, Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failAudit: false, conflicts: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: controls.conflicts }));
vi.mock("@/lib/services/audit", async original => {
  const actual = await original<typeof import("@/lib/services/audit")>();
  return { ...actual, logAudit: async (...args: Parameters<typeof actual.logAudit>) => {
    if (controls.failAudit) throw new Error("Fixture audit failure");
    return actual.logAudit(...args);
  } };
});
requireTestDatabase();

const factory = createSharedWorkflowFactory({ namespace: `integration-settings-${randomUUID()}` });
const business = factory.business();
const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const user = factory.user({ contactNumber: `test-settings-${randomUUID()}` });
let context: OwnerActorContext;
const hour = { day_of_week: 1, category: "GENERAL", open_time: "09:00", close_time: "18:00", is_closed: false };
const hours = Array.from({ length: 35 }, (_, index) => ({ ...hour, day_of_week: index % 7, category: `Fixture-${Math.floor(index / 7)}` }));

describe("owner business settings in PostgreSQL", () => {
  beforeAll(async () => {
    for (const fixture of [business, foreign]) {
      await prisma.business.create({ data: { id: fixture.id, slug: fixture.slug, name: fixture.name, initials: fixture.initials } });
    }
    await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: Role.OWNER } });
    const owner = await prisma.owner.create({ data: { user_id: user.id, business_id: business.id, permissions: [OwnerPermission.SETTINGS_MANAGE] } });
    context = { success: true, actorType: "OWNER", role: Role.OWNER, ownerId: owner.id, userId: user.id, businessId: business.id, businessSlug: business.slug, employeeId: null, profile: null, permissions: [], businessPolicy: { structure: "OWNER_EMPLOYEE_SELF_SERVICE", allowEmployeeSelfBooking: true, managerCanServe: true } };
  });

  beforeEach(async () => {
    controls.failAudit = false;
    controls.conflicts.mockReset();
    await prisma.auditLog.deleteMany({ where: { business_id: { in: [business.id, foreign.id] } } });
    await prisma.businessHours.deleteMany({ where: { business_id: { in: [business.id, foreign.id] } } });
    await prisma.business.update({ where: { id: business.id }, data: { booking_horizon_days: 14 } });
    await prisma.user.update({ where: { id: user.id }, data: { role: Role.OWNER } });
    await prisma.owner.update({ where: { id: context.ownerId }, data: { permissions: [OwnerPermission.SETTINGS_MANAGE] } });
  });

  afterAll(async () => {
    controls.failAudit = false;
    try {
      await prisma.auditLog.deleteMany({ where: { business_id: { in: [business.id, foreign.id] } } });
      await prisma.business.deleteMany({ where: { id: { in: [business.id, foreign.id] } } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    } finally { await prisma.$disconnect(); }
  });

  it("persists policy and a verified-actor audit together", async () => {
    expect(await saveBookingPolicy(context, { bookingHorizonDays: 21 })).toEqual({ success: true });
    expect((await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).booking_horizon_days).toBe(21);
    expect(await prisma.auditLog.findMany({ where: { business_id: business.id }, select: { actor_id: true, changes: true } })).toEqual([{ actor_id: user.id, changes: expect.objectContaining({ after: expect.objectContaining({ booking_horizon_days: 21, mode: "BOOKING_POLICY_CHANGED" }) }) }]);
  });

  it("rolls policy back if its audit cannot be written", async () => {
    controls.failAudit = true;
    expect(await saveBookingPolicy(context, { bookingHorizonDays: 21 })).toEqual({ success: false, error: "Unable to update booking policy." });
    expect((await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).booking_horizon_days).toBe(14);
    expect(await prisma.auditLog.count({ where: { business_id: business.id } })).toBe(0);
  });

  it("persists more than 25 hours atomically, keeps latest duplicates and leaves unspecified/foreign hours unchanged", async () => {
    await prisma.businessHours.create({ data: { ...hour, business_id: business.id } });
    await prisma.businessHours.create({ data: { ...hour, business_id: foreign.id } });
    expect(await saveBusinessHours(context, [...hours, { ...hours[0], close_time: "19:00" }])).toEqual({ success: true });
    expect(await prisma.businessHours.count({ where: { business_id: business.id } })).toBe(36);
    expect(await prisma.businessHours.findFirst({ where: { business_id: business.id, category: "Fixture-0", day_of_week: 0 } })).toMatchObject({ close_time: "19:00" });
    expect(await prisma.businessHours.findFirst({ where: { business_id: business.id, category: "GENERAL" } })).toMatchObject(hour);
    expect(await prisma.businessHours.findMany({ where: { business_id: foreign.id } })).toEqual([expect.objectContaining(hour)]);
    expect(await prisma.auditLog.count({ where: { business_id: business.id } })).toBe(1);
    expect(controls.conflicts).toHaveBeenCalledTimes(1);
  });

  it("rolls every hour back on audit failure, including more than one former batch", async () => {
    await prisma.businessHours.create({ data: { ...hours[0], business_id: business.id, close_time: "17:00" } });
    controls.failAudit = true;
    expect(await saveBusinessHours(context, hours)).toEqual({ success: false, error: "Unable to update business hours." });
    expect(await prisma.businessHours.findMany({ where: { business_id: business.id } })).toEqual([expect.objectContaining({ ...hours[0], close_time: "17:00" })]);
    expect(await prisma.auditLog.count({ where: { business_id: business.id } })).toBe(0);
    expect(controls.conflicts).not.toHaveBeenCalled();
  });

  it("removes a separate schedule atomically while leaving foreign hours intact", async () => {
    const separate = {...hour,category:"Spa",open_time:"10:00"};
    await prisma.businessHours.createMany({data:[{...hour,business_id:business.id},{...separate,business_id:business.id},{...separate,business_id:foreign.id}]});
    expect(await saveBusinessHours(context,[{...hour,close_time:"20:00"}],{expectedHours:[hour,separate],resetCategories:["Spa"]})).toEqual({success:true});
    expect(await prisma.businessHours.findMany({where:{business_id:business.id}})).toEqual([expect.objectContaining({...hour,close_time:"20:00"})]);
    expect(await prisma.businessHours.count({where:{business_id:foreign.id,category:"Spa"}})).toBe(1);
    expect(await prisma.auditLog.count({where:{business_id:business.id}})).toBe(1);
  });

  it("rolls category removal back if the audit fails", async () => {
    const separate = {...hour,category:"Spa"};
    await prisma.businessHours.createMany({data:[{...hour,business_id:business.id},{...separate,business_id:business.id}]});
    controls.failAudit=true;
    expect(await saveBusinessHours(context,[],{expectedHours:[hour,separate],resetCategories:["Spa"]})).toEqual({success:false,error:"Unable to update business hours."});
    expect(await prisma.businessHours.count({where:{business_id:business.id}})).toBe(2);
    expect(controls.conflicts).not.toHaveBeenCalled();
  });

  it("rejects a stale snapshot without deleting the current schedule", async () => {
    await prisma.businessHours.create({data:{...hour,business_id:business.id}});
    expect(await saveBusinessHours(context,[],{expectedHours:[],resetCategories:["Spa"]})).toMatchObject({success:false,error:expect.stringContaining("Hours changed")});
    expect(await prisma.businessHours.count({where:{business_id:business.id}})).toBe(1);
    expect(await prisma.auditLog.count({where:{business_id:business.id}})).toBe(0);
  });

  it("denies a settings capability revoked after actor resolution", async () => {
    await prisma.owner.update({ where: { id: context.ownerId }, data: { permissions: [] } });
    expect(await saveBookingPolicy(context, { bookingHorizonDays: 21 })).toEqual({ success: false, error: "Forbidden" });
    expect(await saveBusinessHours(context, hours)).toEqual({ success: false, error: "Forbidden" });
    expect((await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).booking_horizon_days).toBe(14);
    expect(await prisma.businessHours.count({ where: { business_id: business.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { business_id: business.id } })).toBe(0);
  });

  it("denies a verified owner context paired with a foreign tenant", async () => {
    const foreignContext = { ...context, businessId: foreign.id, businessSlug: foreign.slug };
    expect(await saveBookingPolicy(foreignContext, {})).toEqual({ success: false, error: "Forbidden" });
    expect(await saveBusinessHours(foreignContext, hours)).toEqual({ success: false, error: "Forbidden" });
    expect(await prisma.businessHours.count({ where: { business_id: foreign.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { business_id: foreign.id } })).toBe(0);
  });

  it("denies a stale owner context after the current user role changes", async () => {
    await prisma.user.update({ where: { id: user.id }, data: { role: Role.EMPLOYEE } });
    expect(await saveBookingPolicy(context, {})).toEqual({ success: false, error: "Forbidden" });
    expect(await saveBusinessHours(context, hours)).toEqual({ success: false, error: "Forbidden" });
    expect(await prisma.auditLog.count({ where: { business_id: business.id } })).toBe(0);
  });
});
