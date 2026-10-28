import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { clockInSelfServiceAttendance, clockOutSelfServiceAttendance } from "@/features/workforce/services/attendance-self-service";
import { getSelfServiceAttendanceStatus, getSelfServiceMonthlyAttendance } from "@/features/workforce/queries/attendance-self-service";
import { prisma } from "@/prisma/prisma";

const controls = vi.hoisted(() => ({ failCreate: false, failUpdate: false, writeReached: false, beforeTransaction: null as null | (() => Promise<void>), afterRead: null as null | (() => Promise<void>), conflicts: vi.fn(), warning: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: controls.conflicts }));
vi.mock("@/lib/logger", () => ({ logger: { warn: controls.warning } }));
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, { get(client, key) {
    if (key === "$transaction") return async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) => {
      const before = controls.beforeTransaction; controls.beforeTransaction = null; if (before) await before();
      return client.$transaction(tx => work(new Proxy(tx, { get(transaction, member) {
        if (member !== "employeeAttendance") return Reflect.get(transaction, member);
        return new Proxy(transaction.employeeAttendance, { get(model, operation) {
          if (operation === "findFirst") return async (args: Prisma.EmployeeAttendanceFindFirstArgs) => {
            const result = await model.findFirst(args); const after = controls.afterRead; controls.afterRead = null; if (after) await after(); return result;
          };
          if (operation === "create") return async (args: Prisma.EmployeeAttendanceCreateArgs) => {
            const result = await model.create(args); if (controls.failCreate) { controls.writeReached = true; throw new Error("Fixture post-create failure"); } return result;
          };
          if (operation === "updateMany") return async (args: Prisma.EmployeeAttendanceUpdateManyArgs) => {
            const result = await model.updateMany(args); if (controls.failUpdate) { controls.writeReached = true; throw new Error("Fixture post-update failure"); } return result;
          };
          const value = Reflect.get(model, operation); return typeof value === "function" ? value.bind(model) : value;
        } });
      } })), options);
    };
    const value = Reflect.get(client, key); return typeof value === "function" ? value.bind(client) : value;
  } }) };
});
requireTestDatabase();

const now = new Date("2030-01-15T16:30:00Z"); const day = new Date("2030-01-15T16:00:00Z");
const factory = createSharedWorkflowFactory({ namespace: "integration-attendance-self-service", now });
const tenant = factory.business(); const foreign = factory.business({ id: `${tenant.id}-foreign`, slug: `${tenant.slug}-foreign` });
const tenants = [tenant.id, foreign.id];
const users = [factory.user({ id: `${tenant.id}-staff`, role: "EMPLOYEE", contactNumber: "fixture-attendance-staff" }), factory.user({ id: `${tenant.id}-colleague`, role: "EMPLOYEE", contactNumber: "fixture-attendance-colleague" }), factory.user({ id: `${tenant.id}-owner`, role: "OWNER", contactNumber: "fixture-attendance-owner" })];
let employeeId: number; let colleagueId: number;
const identity = () => ({ businessSlug: tenant.slug, userId: users[0].id });
const input = () => ({ businessSlug: tenant.slug, employeeId, latitude: 14.5, longitude: 121 });
const attendance = () => prisma.employeeAttendance.findMany({ where: { employee_id: { in: [employeeId, colleagueId] } }, orderBy: { id: "asc" } });
const createAttendance = (overrides: Partial<Prisma.EmployeeAttendanceUncheckedCreateInput> = {}) => prisma.employeeAttendance.create({ data: { employee_id: employeeId, date: day, time_in: now, status: "PRESENT", ...overrides } });
async function cleanup() {
  try { await prisma.business.deleteMany({ where: { id: { in: tenants } } }); }
  finally { await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); }
}
describe("self-service attendance in isolated PostgreSQL", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    try {
      await cleanup();
      for (const business of [tenant, foreign]) await prisma.business.create({ data: { id: business.id, slug: business.slug, name: business.name, initials: business.initials, latitude: 14.5, longitude: 121 } });
      for (const user of users) await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: user.role } });
      employeeId = (await prisma.employee.create({ data: { business_id: tenant.id, user_id: users[0].id, salary: 0 } })).id;
      colleagueId = (await prisma.employee.create({ data: { business_id: tenant.id, user_id: users[1].id, salary: 0 } })).id;
      await prisma.owner.create({ data: { business_id: tenant.id, user_id: users[2].id } });
    } catch (error) { await cleanup(); throw error; }
  });
  beforeEach(async () => {
    controls.failCreate = false; controls.failUpdate = false; controls.writeReached = false; controls.beforeTransaction = null; controls.afterRead = null; controls.conflicts.mockReset(); controls.warning.mockReset();
    await prisma.employeeAttendance.deleteMany({ where: { employee_id: { in: [employeeId, colleagueId] } } });
    await prisma.user.update({ where: { id: users[0].id }, data: { role: "EMPLOYEE" } });
    await prisma.employee.update({ where: { id: employeeId }, data: { business_id: tenant.id } });
    await prisma.business.update({ where: { id: tenant.id }, data: { latitude: 14.5, longitude: 121 } });
  });
  afterAll(async () => { controls.beforeTransaction = null; controls.afterRead = null; try { await cleanup(); } finally { vi.useRealTimers(); await prisma.$disconnect(); } });

  it("commits verified self attendance on the PH day without payroll writes", async () => {
    expect(await clockInSelfServiceAttendance(identity(), input())).toMatchObject({ success: true, data: { employee_id: employeeId, date: day, time_in: now, time_out: null, status: "PRESENT", location_verified: true, latitude: 14.5, longitude: 121, paid_in_payslip_id: null } });
    expect(await attendance()).toHaveLength(1); expect(controls.conflicts).toHaveBeenCalledOnce(); expect(await prisma.payslip.count({ where: { employee_id: employeeId } })).toBe(0);
  });
  it("allows current tenant owners reading employee attendance", async () => {
    const row = await createAttendance();
    expect(await getSelfServiceAttendanceStatus({ businessSlug: tenant.slug, userId: users[2].id }, { employeeId, date: now })).toEqual({ success: true, data: row });
  });
  it("uses PH day bounds and zero-based month boundaries for protected reads", async () => {
    const yesterday = await createAttendance({ date: new Date(day.getTime() - 1) }); const today = await createAttendance(); const next = await createAttendance({ date: new Date("2030-01-31T16:00:00Z") });
    expect(await getSelfServiceAttendanceStatus(identity(), { employeeId, date: now })).toEqual({ success: true, data: today });
    const result = await getSelfServiceMonthlyAttendance(identity(), { employeeId, year: 2030, month: 0 });
    expect(result.success && result.data.map(row => row.id).sort()).toEqual([yesterday.id, today.id].sort());
    expect(result.success && result.data.some(row => row.id === next.id)).toBe(false);
  });
  it("denies colleague reads and clocks without writes", async () => {
    expect((await getSelfServiceAttendanceStatus(identity(), { employeeId: colleagueId, date: now })).success).toBe(false);
    expect((await clockInSelfServiceAttendance(identity(), { ...input(), employeeId: colleagueId })).success).toBe(false); expect(await attendance()).toHaveLength(0);
  });
  it("denies owner clocking a tenant employee", async () => {
    expect((await clockInSelfServiceAttendance({ businessSlug: tenant.slug, userId: users[2].id }, input())).success).toBe(false); expect(await attendance()).toHaveLength(0);
  });
  it("denies a foreign tenant identity and mismatched legacy business slug", async () => {
    expect((await clockInSelfServiceAttendance({ businessSlug: foreign.slug, userId: users[0].id }, { ...input(), businessSlug: foreign.slug })).success).toBe(false);
    expect((await clockInSelfServiceAttendance(identity(), { ...input(), businessSlug: foreign.slug })).success).toBe(false); expect(await attendance()).toHaveLength(0);
  });
  it("rejects an actual stored nonemployee role despite employee membership", async () => {
    await prisma.user.update({ where: { id: users[0].id }, data: { role: "PLATFORM_ADMIN" } });
    expect((await clockInSelfServiceAttendance(identity(), input())).success).toBe(false); expect(await attendance()).toHaveLength(0);
  });
  it("rechecks membership role after initial access before transaction", async () => {
    controls.beforeTransaction = async () => { await prisma.user.update({ where: { id: users[0].id }, data: { role: "PLATFORM_ADMIN" } }); };
    expect((await clockInSelfServiceAttendance(identity(), input())).success).toBe(false); expect(await attendance()).toHaveLength(0); expect(controls.conflicts).not.toHaveBeenCalled();
  });
  it("rechecks tenant membership after initial access before transaction", async () => {
    controls.beforeTransaction = async () => { await prisma.employee.update({ where: { id: employeeId }, data: { business_id: foreign.id } }); };
    expect((await clockInSelfServiceAttendance(identity(), input())).success).toBe(false); expect(await attendance()).toHaveLength(0);
  });
  it("rejects missing workplace GPS without writes", async () => {
    await prisma.business.update({ where: { id: tenant.id }, data: { latitude: null } });
    expect(await clockInSelfServiceAttendance(identity(), input())).toEqual({ success: false, error: "Business location not set. Contact owner." }); expect(await attendance()).toHaveLength(0);
  });
  it("preserves default100m GPS denial without writes", async () => {
    expect(await clockInSelfServiceAttendance(identity(), { ...input(), latitude: 14.51 })).toMatchObject({ success: false, error: expect.stringContaining("Max allowed: 100m") }); expect(await attendance()).toHaveLength(0);
  });
  it("rejects duplicate PH days even when an existing row is not at midnight", async () => {
    const row = await createAttendance({ date: now });
    expect(await clockInSelfServiceAttendance(identity(), input())).toEqual({ success: false, error: "Already clocked in today." }); expect(await attendance()).toEqual([row]); expect(controls.conflicts).not.toHaveBeenCalled();
  });
  it("allows at most one concurrent same-day clock-in", async () => {
    const results = await Promise.all([clockInSelfServiceAttendance(identity(), input()), clockInSelfServiceAttendance(identity(), input())]);
    expect(results.filter(result => result.success)).toHaveLength(1); expect(await attendance()).toHaveLength(1); expect(controls.conflicts).toHaveBeenCalledOnce();
  });
  it("rolls back an injected failure after attendance create", async () => {
    controls.failCreate = true;
    expect((await clockInSelfServiceAttendance(identity(), input())).success).toBe(false); expect(controls.writeReached).toBe(true); expect(await attendance()).toHaveLength(0); expect(controls.conflicts).not.toHaveBeenCalled();
  });
  it("clock-out changes only time_out, retaining GPS and pay status", async () => {
    const before = await createAttendance({ latitude: 14.49, longitude: 120.99, location_verified: false, status: "LATE" });
    const result = await clockOutSelfServiceAttendance(identity(), input());
    expect(result).toMatchObject({ success: true, data: { ...before, time_out: now, updated_at: expect.any(Date) } });
    const after = (await attendance())[0]; expect(after).toEqual({ ...before, time_out: now, updated_at: after.updated_at }); expect(controls.conflicts).toHaveBeenCalledOnce();
  });
  it("rejects missing or already closed clock-out without notifications", async () => {
    expect(await clockOutSelfServiceAttendance(identity(), input())).toEqual({ success: false, error: "No attendance record found for today." });
    const row = await createAttendance({ time_out: now });
    expect(await clockOutSelfServiceAttendance(identity(), input())).toEqual({ success: false, error: "Already clocked out." }); expect(await attendance()).toEqual([row]); expect(controls.conflicts).not.toHaveBeenCalled();
  });
  it("allows at most one concurrent clock-out", async () => {
    await createAttendance(); const results = await Promise.all([clockOutSelfServiceAttendance(identity(), input()), clockOutSelfServiceAttendance(identity(), input())]);
    expect(results.filter(result => result.success)).toHaveLength(1); expect((await attendance())[0].time_out).toEqual(now); expect(controls.conflicts).toHaveBeenCalledOnce();
  });
  it("rejects a stale clock-out after a competing committed close", async () => {
    const row = await createAttendance(); const competingTime = new Date(now.getTime() - 1000);
    controls.afterRead = async () => { await prisma.employeeAttendance.update({ where: { id: row.id }, data: { time_out: competingTime } }); };
    expect((await clockOutSelfServiceAttendance(identity(), input())).success).toBe(false); expect((await attendance())[0].time_out).toEqual(competingTime); expect(controls.conflicts).not.toHaveBeenCalled();
  });
  it("rolls back an injected failure after conditional clock-out write", async () => {
    const row = await createAttendance(); controls.failUpdate = true;
    expect((await clockOutSelfServiceAttendance(identity(), input())).success).toBe(false); expect(controls.writeReached).toBe(true); expect(await attendance()).toEqual([row]); expect(controls.conflicts).not.toHaveBeenCalled();
  });
  it("preserves committed success if provider and warning logging fail", async () => {
    controls.conflicts.mockRejectedValue(new Error("Fixture provider unavailable")); controls.warning.mockImplementation(() => { throw new Error("Fixture logger unavailable"); });
    expect((await clockInSelfServiceAttendance(identity(), input())).success).toBe(true); expect(await attendance()).toHaveLength(1);
  });
});
