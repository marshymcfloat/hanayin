import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { createEmployeeAdministration, deleteEmployeeAdministration, replaceEmployeeAdministrationSchedule, resendEmployeeAdministrationInvite, resetEmployeeAdministrationPassword, updateEmployeeAdministration } from "@/features/workforce/services/employee-administration";
import { getEmployeeAdministrationList, getEmployeeAdministrationSchedule } from "@/features/workforce/queries/employee-administration";

const controls = vi.hoisted(() => ({ failModel: "", failOperation: "", writeReached: false, beforeTransaction: null as null | (() => Promise<void>), sms: vi.fn(), conflicts: vi.fn(), warning: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: vi.fn() }));
vi.mock("bcryptjs", () => ({ hash: vi.fn(async () => "fixture-new-password-hash") }));
vi.mock("@/lib/services/employee-invite", () => ({ sendEmployeeInviteSms: controls.sms }));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: controls.conflicts }));
vi.mock("@/lib/logger", () => ({ logger: { warn: controls.warning } }));
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  return { prisma: new Proxy(actual.prisma, { get(client, key) {
    if (key === "$transaction") return async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) => {
      const before = controls.beforeTransaction; controls.beforeTransaction = null; if (before) await before();
      return client.$transaction(tx => work(new Proxy(tx, { get(transaction, modelName) {
        const model = Reflect.get(transaction, modelName);
        if (!model || typeof model !== "object" || typeof modelName !== "string") return model;
        return new Proxy(model, { get(delegate, operation) {
          const value = Reflect.get(delegate, operation);
          if (typeof value !== "function") return value;
          return async (...args: unknown[]) => {
            const result = await value.apply(delegate, args);
            if (modelName === controls.failModel && operation === controls.failOperation) { controls.writeReached = true; throw new Error("Fixture post-write failure"); }
            return result;
          };
        } });
      } })), options);
    };
    const value = Reflect.get(client, key); return typeof value === "function" ? value.bind(client) : value;
  } }) };
});
requireTestDatabase();

const now = new Date("2030-01-15T09:00:00Z"); const day = new Date("2030-01-14T16:00:00Z");
const factory = createSharedWorkflowFactory({ namespace: "integration-employee-administration", now });
const tenant = factory.business(); const foreign = factory.business({ id: `${tenant.id}-foreign`, slug: `${tenant.slug}-foreign` });
const businesses = [tenant, foreign]; const tenants = businesses.map(business => business.id);
const users = [factory.user({ id: `${tenant.id}-owner`, role: "OWNER", contactNumber: "fixture-employee-admin-owner" }), factory.user({ id: `${tenant.id}-staff`, role: "EMPLOYEE", contactNumber: "639551234566" }), factory.user({ id: `${tenant.id}-foreign`, role: "EMPLOYEE", contactNumber: "fixture-employee-admin-foreign" })];
const createdContact = "639551234567"; const createdName = `${tenant.id} created staff`;
const createdUsers = new Set<string>(); let employeeId: number; let foreignEmployeeId: number; let ownerId: number; let bookingId: number; let foreignBookingId: number; let serviceId: number; let foreignServiceId: number;
const identity = () => ({ businessSlug: tenant.slug, userId: users[0].id });
const account = () => prisma.user.findUniqueOrThrow({ where: { id: users[1].id } });
const employee = () => prisma.employee.findUnique({ where: { id: employeeId } });
const rows = [{ day_of_week: 1, start_time: "09:00", end_time: "12:00" }, { day_of_week: 1, start_time: "13:00", end_time: "17:00" }];
async function collectCreatedUser() { const user = await prisma.user.findFirst({ where: { name: createdName, contact_number: createdContact }, select: { id: true } }); if (user) createdUsers.add(user.id); }
async function cleanup() {
  await collectCreatedUser();
  try { await prisma.business.deleteMany({ where: { id: { in: tenants } } }); }
  finally { await prisma.user.deleteMany({ where: { id: { in: [...users.map(user => user.id), ...createdUsers] } } }); }
}
async function payslip(id: number) { return prisma.payslip.create({ data: { employee_id: id, starting_date: day, ending_date: now, total_salary: 100, status: "PAID", released_at: now } }); }
async function work(overrides: Partial<Prisma.AvailedServiceUncheckedCreateInput> = {}) {
  return prisma.availedService.create({ data: { booking_id: bookingId, service_id: serviceId, served_by_id: employeeId, served_by_type: "EMPLOYEE", status: "COMPLETED", completed_at: now, price: 100, final_price: 100, commission_base: 100, ...overrides } });
}
describe("employee administration in isolated PostgreSQL", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    try {
      await cleanup();
      for (const business of businesses) await prisma.business.create({ data: { id: business.id, slug: business.slug, name: business.name, initials: business.initials } });
      for (const user of users) await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: user.role } });
      ownerId = (await prisma.owner.create({ data: { business_id: tenant.id, user_id: users[0].id } })).id;
      employeeId = (await prisma.employee.create({ data: { business_id: tenant.id, user_id: users[1].id, salary: 0, daily_rate: 100, commission_percentage: 10 } })).id;
      foreignEmployeeId = (await prisma.employee.create({ data: { business_id: foreign.id, user_id: users[2].id, salary: 0 } })).id;
      const service = factory.service();
      serviceId = (await prisma.service.create({ data: { business_id: tenant.id, name: service.name, category: service.category, price: 100 } })).id;
      foreignServiceId = (await prisma.service.create({ data: { business_id: foreign.id, name: service.name, category: service.category, price: 100 } })).id;
      bookingId = (await prisma.booking.create({ data: { business_id: tenant.id, is_anonymous_walk_in: true, grand_total: 100, total_discount: 0 } })).id;
      foreignBookingId = (await prisma.booking.create({ data: { business_id: foreign.id, is_anonymous_walk_in: true, grand_total: 100, total_discount: 0 } })).id;
    } catch (error) { await cleanup(); throw error; }
  });
  beforeEach(async () => {
    controls.failModel = ""; controls.failOperation = ""; controls.writeReached = false; controls.beforeTransaction = null; controls.sms.mockReset(); controls.sms.mockResolvedValue({ success: true }); controls.conflicts.mockReset(); controls.warning.mockReset();
    await collectCreatedUser();
    await prisma.availedService.deleteMany({ where: { booking_id: { in: [bookingId, foreignBookingId] } } });
    await prisma.brandAsset.deleteMany({ where: { business_id: { in: tenants } } }); await prisma.leaveRequest.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.employeeAttendance.deleteMany({ where: { employee: { business_id: { in: tenants } } } }); await prisma.payslip.deleteMany({ where: { employee: { business_id: { in: tenants } } } });
    await prisma.employeeSchedule.deleteMany({ where: { employee: { business_id: { in: tenants } } } });
    await prisma.user.deleteMany({ where: { id: { in: [...createdUsers] } } }); createdUsers.clear();
    await prisma.user.update({ where: { id: users[0].id }, data: { role: "OWNER" } }); await prisma.owner.update({ where: { id: ownerId }, data: { business_id: tenant.id } });
    await prisma.user.update({ where: { id: users[1].id }, data: { role: "EMPLOYEE", name: users[1].name, contact_number: users[1].contactNumber, hashed_password: "fixture-original-password-hash", must_change_password: true, temp_password_expires_at: day } });
    const current = await prisma.employee.findUnique({ where: { user_id: users[1].id } });
    if (!current) employeeId = (await prisma.employee.create({ data: { business_id: tenant.id, user_id: users[1].id, salary: 0, daily_rate: 100, commission_percentage: 10 } })).id;
    else { employeeId = current.id; await prisma.employee.update({ where: { id: employeeId }, data: { business_id: tenant.id, daily_rate: 100, commission_percentage: 10, profile: "STAFF", specialties: [], recurring_days_off: [] } }); }
  });
  afterAll(async () => { controls.beforeTransaction = null; try { await cleanup(); } finally { vi.useRealTimers(); await prisma.$disconnect(); } });

  it("creates account and employee atomically with nonsecret result", async () => {
    const result = await createEmployeeAdministration(identity(), { name: createdName, contact_number: "09551234567", daily_rate: 0, commission_percentage: 0, recurring_days_off: [2, 2, 8, -1] });
    expect(result).toMatchObject({ success: true, data: { business_id: tenant.id, recurring_days_off: [2], user: { contact_number: createdContact } } }); expect(JSON.stringify(result)).not.toMatch(/hashed_password|must_change_password|temp_password_expires_at|tempPassword/); await collectCreatedUser();
    const stored = await prisma.user.findUniqueOrThrow({ where: { contact_number: createdContact } }); expect(stored).toMatchObject({ hashed_password: "fixture-new-password-hash", must_change_password: true, temp_password_expires_at: new Date(now.getTime() + 3 * 86400000) }); expect(controls.sms).toHaveBeenCalledOnce();
  });
  it("rolls back a create failure after employee insertion without orphan account", async () => {
    controls.failModel = "employee"; controls.failOperation = "create";
    expect((await createEmployeeAdministration(identity(), { name: createdName, contact_number: "09551234567", daily_rate: 0, commission_percentage: 0 })).success).toBe(false); expect(controls.writeReached).toBe(true); expect(await prisma.user.findUnique({ where: { contact_number: createdContact } })).toBeNull(); expect(controls.sms).not.toHaveBeenCalled();
  });
  it("requires actual owner role before writes despite extant owner membership", async () => {
    await prisma.user.update({ where: { id: users[0].id }, data: { role: "PLATFORM_ADMIN" } }); const before = await account();
    expect((await resetEmployeeAdministrationPassword(identity(), employeeId, "x")).success).toBe(false); expect(await account()).toEqual(before);
  });
  it("rechecks actual owner role at transaction start", async () => {
    controls.beforeTransaction = async () => { await prisma.user.update({ where: { id: users[0].id }, data: { role: "PLATFORM_ADMIN" } }); }; const before = await account();
    expect((await resetEmployeeAdministrationPassword(identity(), employeeId, "x")).success).toBe(false); expect(await account()).toEqual(before); expect(controls.sms).not.toHaveBeenCalled();
  });
  it("rechecks owner tenant membership at transaction start", async () => {
    controls.beforeTransaction = async () => { await prisma.owner.update({ where: { id: ownerId }, data: { business_id: foreign.id } }); };
    expect((await updateEmployeeAdministration(identity(), employeeId, { daily_rate: 999 })).success).toBe(false); expect((await employee())?.daily_rate).toBe(100);
  });
  it("denies foreign employee mutations and schedule reads without data changes", async () => {
    const before = await prisma.employee.findUniqueOrThrow({ where: { id: foreignEmployeeId } });
    expect((await updateEmployeeAdministration(identity(), foreignEmployeeId, { name: "Changed" })).success).toBe(false); expect((await getEmployeeAdministrationSchedule(identity(), foreignEmployeeId)).success).toBe(false); expect(await prisma.employee.findUniqueOrThrow({ where: { id: foreignEmployeeId } })).toEqual(before);
  });
  it("keeps list user data nonsecret and tenant scoped", async () => {
    const result = await getEmployeeAdministrationList(identity()); expect(result.success).toBe(true); if (!result.success) throw new Error("Expected list");
    expect(result.data.every(row => row.business_id === tenant.id)).toBe(true); expect(JSON.stringify(result)).not.toMatch(/hashed_password|must_change_password|temp_password_expires_at/);
  });
  it("allows a current employee to read a colleague's tenant schedule", async () => {
    const second = await prisma.employee.create({ data: { business_id: tenant.id, user_id: (await prisma.user.create({ data: { name: createdName, contact_number: createdContact, hashed_password: "fixture-password", role: "EMPLOYEE" } })).id, salary: 0 } }); createdUsers.add(second.user_id);
    await prisma.employeeSchedule.createMany({ data: rows.map(row => ({ ...row, employee_id: employeeId })) });
    expect(await getEmployeeAdministrationSchedule({ businessSlug: tenant.slug, userId: second.user_id }, employeeId)).toEqual({ success: true, data: rows });
  });
  it("atomically updates user and employee with existing profile/day defaults", async () => {
    expect(await updateEmployeeAdministration(identity(), employeeId, { name: "Changed", daily_rate: 0, profile: "CASHIER", recurring_days_off: [6, 6, -1] })).toEqual({ success: true }); expect(await account()).toMatchObject({ name: "Changed" }); expect(await employee()).toMatchObject({ daily_rate: 0, profile: "CASHIER", recurring_days_off: [6] });
  });
  it("rolls back account update when employee update fails after its write", async () => {
    const beforeUser = await account(); const beforeEmployee = await employee(); controls.failModel = "employee"; controls.failOperation = "updateMany";
    expect((await updateEmployeeAdministration(identity(), employeeId, { name: "Changed", daily_rate: 999 })).success).toBe(false); expect(controls.writeReached).toBe(true); expect(await account()).toEqual(beforeUser); expect(await employee()).toEqual(beforeEmployee);
  });
  it("owner permanent reset clears expired temporary-password flags", async () => {
    expect(await resetEmployeeAdministrationPassword(identity(), employeeId, "x")).toEqual({ success: true }); expect(await account()).toMatchObject({ hashed_password: "fixture-new-password-hash", must_change_password: false, temp_password_expires_at: null }); expect(controls.sms).not.toHaveBeenCalled();
  });
  it("rejects stale reset credential snapshot after another committed rotation", async () => {
    controls.beforeTransaction = async () => { await prisma.user.update({ where: { id: users[1].id }, data: { hashed_password: "fixture-competing-password" } }); };
    expect((await resetEmployeeAdministrationPassword(identity(), employeeId, "x")).success).toBe(false); expect((await account()).hashed_password).toBe("fixture-competing-password");
  });
  it("resend returns fresh one-time plaintext and preserves3day expiry", async () => {
    const result = await resendEmployeeAdministrationInvite(identity(), employeeId); expect(result).toMatchObject({ success: true, tempPassword: expect.stringMatching(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/) });
    expect(await account()).toMatchObject({ hashed_password: "fixture-new-password-hash", must_change_password: true, temp_password_expires_at: new Date(now.getTime() + 3 * 86400000) });
  });
  it("rejects stale invite snapshot after another committed contact/password edit", async () => {
    controls.beforeTransaction = async () => { await prisma.user.update({ where: { id: users[1].id }, data: { hashed_password: "fixture-competing-password" } }); };
    expect((await resendEmployeeAdministrationInvite(identity(), employeeId)).success).toBe(false); expect((await account()).hashed_password).toBe("fixture-competing-password"); expect(controls.sms).not.toHaveBeenCalled();
  });
  it("rolls back password write after an injected post-account-write failure", async () => {
    const before = await account(); controls.failModel = "user"; controls.failOperation = "updateMany";
    expect((await resetEmployeeAdministrationPassword(identity(), employeeId, "x")).success).toBe(false); expect(controls.writeReached).toBe(true); expect(await account()).toEqual(before);
  });
  it("preserves committed invite when SMS and optional logger throw", async () => {
    controls.sms.mockRejectedValue(new Error("Fixture provider unavailable")); controls.warning.mockImplementation(() => { throw new Error("Fixture logger unavailable"); });
    expect(await resendEmployeeAdministrationInvite(identity(), employeeId)).toMatchObject({ success: true, tempPassword: expect.any(String), warning: expect.any(String) }); expect((await account()).hashed_password).toBe("fixture-new-password-hash");
  });
  it("preserves committed specialty update when conflict notifier/logging throw", async () => {
    controls.conflicts.mockRejectedValue(new Error("Fixture provider unavailable")); controls.warning.mockImplementation(() => { throw new Error("Fixture logger unavailable"); });
    expect(await updateEmployeeAdministration(identity(), employeeId, { specialties: ["Hair"] })).toEqual({ success: true }); expect((await employee())?.specialties).toEqual(["Hair"]);
  });
  it("replace-all keeps split shifts and empty array clears", async () => {
    expect(await replaceEmployeeAdministrationSchedule(identity(), employeeId, rows)).toEqual({ success: true }); expect(await getEmployeeAdministrationSchedule(identity(), employeeId)).toEqual({ success: true, data: rows });
    expect(await replaceEmployeeAdministrationSchedule(identity(), employeeId, [])).toEqual({ success: true }); expect(await prisma.employeeSchedule.count({ where: { employee_id: employeeId } })).toBe(0);
  });
  it("rolls back replace-all after schedule insert failure, retaining previous rows", async () => {
    await prisma.employeeSchedule.createMany({ data: rows.map(row => ({ ...row, employee_id: employeeId })) }); const before = await prisma.employeeSchedule.findMany({ where: { employee_id: employeeId } }); controls.failModel = "employeeSchedule"; controls.failOperation = "createMany";
    expect((await replaceEmployeeAdministrationSchedule(identity(), employeeId, [rows[0]])).success).toBe(false); expect(controls.writeReached).toBe(true); expect(await prisma.employeeSchedule.findMany({ where: { employee_id: employeeId } })).toEqual(before);
  });
  it("deletes same-tenant history and schedules without deleting user account", async () => {
    await prisma.employeeSchedule.createMany({ data: rows.map(row => ({ ...row, employee_id: employeeId })) }); const pay = await payslip(employeeId); await prisma.employeeAttendance.create({ data: { employee_id: employeeId, date: day, paid_in_payslip_id: pay.id } }); await work({ paid_in_payslip_id: pay.id });
    expect(await deleteEmployeeAdministration(identity(), employeeId)).toEqual({ success: true }); expect(await employee()).toBeNull(); expect(await account()).toBeDefined(); expect(await prisma.employeeSchedule.count({ where: { employee_id: employeeId } })).toBe(0); expect(await prisma.payslip.findUnique({ where: { id: pay.id } })).toBeNull();
  });
  it.each(["booking", "service"])("rejects malformed foreign%s served-work cascade", async edge => {
    const row = await work(edge === "booking" ? { booking_id: foreignBookingId } : { service_id: foreignServiceId });
    expect((await deleteEmployeeAdministration(identity(), employeeId)).success).toBe(false); expect(await employee()).not.toBeNull(); expect(await prisma.availedService.findUnique({ where: { id: row.id } })).toEqual(row);
  });
  it("rejects malformed foreign brand-asset employee backlink", async () => {
    const asset = await prisma.brandAsset.create({ data: { id: `${tenant.id}-foreign-asset`, business_id: foreign.id, employee_id: employeeId, kind: "EMPLOYEE", url: "https://fixtures.invalid/employee.png" } });
    expect((await deleteEmployeeAdministration(identity(), employeeId)).success).toBe(false); expect(await prisma.brandAsset.findUnique({ where: { id: asset.id } })).toEqual(asset);
  });
  it("rejects malformed foreign leave-request employee backlink", async () => {
    const leave = await prisma.leaveRequest.create({ data: { business_id: foreign.id, employee_id: employeeId, start_date: day, end_date: now, reason: "Fixture leave" } });
    expect((await deleteEmployeeAdministration(identity(), employeeId)).success).toBe(false); expect(await prisma.leaveRequest.findUnique({ where: { id: leave.id } })).toEqual(leave);
  });
  it("rejects foreign employee attendance linked to target employee payslip", async () => {
    const pay = await payslip(employeeId); const attendance = await prisma.employeeAttendance.create({ data: { employee_id: foreignEmployeeId, date: day, paid_in_payslip_id: pay.id } });
    expect((await deleteEmployeeAdministration(identity(), employeeId)).success).toBe(false); expect(await prisma.employeeAttendance.findUnique({ where: { id: attendance.id } })).toEqual(attendance);
  });
  it("rejects target employee attendance linked to foreign employee payslip", async () => {
    const pay = await payslip(foreignEmployeeId); const attendance = await prisma.employeeAttendance.create({ data: { employee_id: employeeId, date: day, paid_in_payslip_id: pay.id } });
    expect((await deleteEmployeeAdministration(identity(), employeeId)).success).toBe(false); expect(await prisma.employeeAttendance.findUnique({ where: { id: attendance.id } })).toEqual(attendance);
  });
  it("rejects foreign booking work linked only through target employee payslip", async () => {
    const pay = await payslip(employeeId); const row = await work({ booking_id: foreignBookingId, service_id: foreignServiceId, served_by_id: foreignEmployeeId, paid_in_payslip_id: pay.id });
    expect((await deleteEmployeeAdministration(identity(), employeeId)).success).toBe(false); expect(await prisma.availedService.findUnique({ where: { id: row.id } })).toEqual(row);
  });
  it("list excludes malformed foreign count and payroll crosslinks", async () => {
    await work({ booking_id: foreignBookingId }); const pay = await payslip(employeeId); await prisma.employeeAttendance.create({ data: { employee_id: foreignEmployeeId, date: day, paid_in_payslip_id: pay.id } });
    const result = await getEmployeeAdministrationList(identity()); if (!result.success) throw new Error("Expected fixture list"); const staff = result.data.find(row => row.id === employeeId);
    expect(staff?._count.served_services).toBe(0); expect(staff?.payslips).toHaveLength(0);
  });
  it("rolls back employee deletion after injected post-delete failure", async () => {
    await prisma.employeeSchedule.createMany({ data: rows.map(row => ({ ...row, employee_id: employeeId })) }); controls.failModel = "employee"; controls.failOperation = "deleteMany";
    expect((await deleteEmployeeAdministration(identity(), employeeId)).success).toBe(false); expect(controls.writeReached).toBe(true); expect(await employee()).not.toBeNull(); expect(await prisma.employeeSchedule.count({ where: { employee_id: employeeId } })).toBe(2);
  });
});
