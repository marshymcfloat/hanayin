import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/scripts/test-database-target.mjs";
import { createSharedWorkflowFactory } from "@/test/factories/shared-workflows";
import { createPayslipAction, getEmployeePayslipAuditAction, getPayslipDataAction, getPayslipHistoryAction } from "@/features/payroll/actions/payslip";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";

const controls = vi.hoisted(() => ({
  auth: vi.fn(), invalidate: vi.fn(), transaction: vi.fn(),
  failure: null as null | "payslip" | "audit" | "attendance" | "services", reached: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: controls.auth }));
vi.mock("next/cache", () => ({ revalidatePath: controls.invalidate }));
vi.mock("@/prisma/prisma", async original => {
  const actual = await original<typeof import("@/prisma/prisma")>();
  const afterWrite = (stage: typeof controls.failure) => {
    if (controls.failure === stage) { controls.reached = true; throw new Error(`Fixture post-${stage}-write failure`); }
  };
  return { prisma: new Proxy(actual.prisma, {
    get(client, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: Parameters<typeof client.$transaction>[1]) => {
        controls.transaction(options);
        return client.$transaction(tx => work(new Proxy(tx, {
          get(transaction, member) {
            if (member === "payslip") return new Proxy(transaction.payslip, {
              get(model, operation) {
                if (operation === "create") return async (args: Prisma.PayslipCreateArgs) => { const result = await model.create(args); afterWrite("payslip"); return result; };
                const value = Reflect.get(model, operation); return typeof value === "function" ? value.bind(model) : value;
              },
            });
            if (member === "auditLog") return new Proxy(transaction.auditLog, {
              get(model, operation) {
                if (operation === "create") return async (args: Prisma.AuditLogCreateArgs) => { const result = await model.create(args); afterWrite("audit"); return result; };
                const value = Reflect.get(model, operation); return typeof value === "function" ? value.bind(model) : value;
              },
            });
            if (member === "employeeAttendance") return new Proxy(transaction.employeeAttendance, {
              get(model, operation) {
                if (operation === "updateMany") return async (args: Prisma.EmployeeAttendanceUpdateManyArgs) => { const result = await model.updateMany(args); afterWrite("attendance"); return result; };
                const value = Reflect.get(model, operation); return typeof value === "function" ? value.bind(model) : value;
              },
            });
            if (member === "availedService") return new Proxy(transaction.availedService, {
              get(model, operation) {
                if (operation === "updateMany") return async (args: Prisma.AvailedServiceUpdateManyArgs) => { const result = await model.updateMany(args); afterWrite("services"); return result; };
                const value = Reflect.get(model, operation); return typeof value === "function" ? value.bind(model) : value;
              },
            });
            const value = Reflect.get(transaction, member); return typeof value === "function" ? value.bind(transaction) : value;
          },
        })), options);
      };
      const value = Reflect.get(client, key); return typeof value === "function" ? value.bind(client) : value;
    },
  }) };
});
requireTestDatabase();

const now = new Date("2030-01-20T09:00:00Z");
const previousRelease = new Date("2030-01-01T09:00:00Z");
const factory = createSharedWorkflowFactory({ namespace: "integration-payslip-administration", now });
const business = factory.business(); const foreign = factory.business({ id: `${business.id}-foreign`, slug: `${business.slug}-foreign` });
const tenants = [business.id, foreign.id];
const users = ["owner", "employee", "manager", "foreign-owner", "foreign-employee"].map(kind => factory.user({ id: `${business.id}-${kind}`, contactNumber: `fixture-payslip-${kind}`, name: `Fixture ${kind}`, role: kind.includes("owner") ? "OWNER" : "EMPLOYEE", createdAt: new Date("2029-12-01T09:00:00Z") }));
let employeeId: number; let managerId: number; let foreignEmployeeId: number; let serviceId: number; let packageId: number;
let previousId: number;
const eligibleAttendance: number[] = []; const eligibleServices: number[] = []; const excludedAttendance: number[] = []; const excludedServices: number[] = [];
let previouslyPaidAttendance: number; let previouslyPaidService: number;

function authenticate(user = users[0], slug = business.slug) {
  controls.auth.mockResolvedValue({ success: true, businessSlug: slug, session: { user: { id: user.id, role: user.role, businessSlug: slug } } });
}
const release = (deduction = 15.55) => createPayslipAction({ employeeId, deduction, comment: "Fixture released payroll" });
const payslips = () => prisma.payslip.findMany({ where: { employee: { business_id: { in: tenants } } }, orderBy: { id: "asc" } });
const audits = () => prisma.auditLog.findMany({ where: { business_id: { in: tenants } }, orderBy: { id: "asc" } });
async function snapshot() {
  return {
    payslips: await payslips(), audits: await audits(),
    attendance: await prisma.employeeAttendance.findMany({ where: { employee: { business_id: { in: tenants } } }, orderBy: { id: "asc" } }),
    services: await prisma.availedService.findMany({ where: { booking: { business_id: { in: tenants } } }, orderBy: { id: "asc" } }),
  };
}
async function cleanup() {
  const errors: unknown[] = [];
  for (const operation of [
    () => prisma.auditLog.deleteMany({ where: { business_id: { in: tenants } } }),
    () => prisma.availedService.deleteMany({ where: { booking: { business_id: { in: tenants } } } }),
    () => prisma.employeeAttendance.deleteMany({ where: { employee: { business_id: { in: tenants } } } }),
    () => prisma.payslip.deleteMany({ where: { employee: { business_id: { in: tenants } } } }),
    () => prisma.business.deleteMany({ where: { id: { in: tenants } } }),
    () => prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }),
  ]) { try { await operation(); } catch (error) { errors.push(error); } }
  if (errors.length) throw new AggregateError(errors, "Scoped payroll fixture cleanup failed");
}
async function assertDenied(work: () => Promise<{ success: boolean }>) {
  const before = await snapshot(); controls.invalidate.mockClear(); expect((await work()).success).toBe(false);
  expect(await snapshot()).toEqual(before); expect(controls.invalidate).not.toHaveBeenCalled();
}

describe("payslip administration on guarded disposable PostgreSQL", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    try {
      await cleanup();
      for (const tenant of [business, foreign]) await prisma.business.create({ data: { id: tenant.id, slug: tenant.slug, name: tenant.name, initials: tenant.initials } });
      for (const user of users) await prisma.user.create({ data: { id: user.id, contact_number: user.contactNumber, name: user.name, hashed_password: user.hashedPassword, role: user.role, created_at: user.createdAt } });
      await prisma.owner.create({ data: { user_id: users[0].id, business_id: business.id } });
      await prisma.owner.create({ data: { user_id: users[3].id, business_id: foreign.id } });
      employeeId = (await prisma.employee.create({ data: { user_id: users[1].id, business_id: business.id, salary: 0, daily_rate: 100, commission_percentage: 10 } })).id;
      managerId = (await prisma.employee.create({ data: { user_id: users[2].id, business_id: business.id, salary: 0, profile: "MANAGER" } })).id;
      foreignEmployeeId = (await prisma.employee.create({ data: { user_id: users[4].id, business_id: foreign.id, salary: 0 } })).id;
      const service = factory.service();
      serviceId = (await prisma.service.create({ data: { business_id: business.id, name: service.name, category: service.category, price: service.price } })).id;
      packageId = (await prisma.servicePackage.create({ data: { business_id: business.id, name: "Fixture package", category: "GENERAL", price: 500 } })).id;
      for (const [date, status, is_paid_leave, target] of [
        ["2030-01-10T09:00:00Z", "PRESENT", false, "own"], ["2030-01-10T12:00:00Z", "PRESENT", false, "own"], ["2030-01-11T09:00:00Z", "LEAVE", true, "own"],
        ["2030-01-12T09:00:00Z", "ABSENT", false, "own"], ["2030-01-13T09:00:00Z", "LEAVE", false, "own"], ["2030-01-14T09:00:00Z", "PRESENT", false, "paid"],
        ["2030-01-10T09:00:00Z", "PRESENT", false, "peer"], ["2030-01-10T09:00:00Z", "PRESENT", false, "foreign"],
      ] as const) {
        const row = await prisma.employeeAttendance.create({ data: { employee_id: target === "peer" ? managerId : target === "foreign" ? foreignEmployeeId : employeeId, date: new Date(date), status, is_paid_leave } });
        if (target === "own" && (status === "PRESENT" || is_paid_leave)) eligibleAttendance.push(row.id); else excludedAttendance.push(row.id);
        if (target === "paid") previouslyPaidAttendance = row.id;
      }
      const bookingRows = await Promise.all([
        prisma.booking.create({ data: { business_id: business.id, grand_total: 500, total_discount: 0, payment_status: "PAID", status: "ACCEPTED", customer_label: "Fixture walk-in" } }),
        prisma.booking.create({ data: { business_id: business.id, grand_total: 500, total_discount: 0, payment_status: "UNPAID", status: "ACCEPTED" } }),
        prisma.booking.create({ data: { business_id: business.id, grand_total: 500, total_discount: 0, payment_status: "PAID", status: "CANCELLED" } }),
        prisma.booking.create({ data: { business_id: foreign.id, grand_total: 500, total_discount: 0, payment_status: "PAID", status: "ACCEPTED" } }),
      ]);
      for (const [index, kind] of ["base-200", "base-100", "base-zero", "pending", "cancelled", "cancelled-at", "unpaid", "cancelled-parent", "paid", "foreign-parent", "peer"].entries()) {
        const row = await prisma.availedService.create({ data: {
          booking_id: bookingRows[kind === "unpaid" ? 1 : kind === "cancelled-parent" ? 2 : kind === "foreign-parent" ? 3 : 0].id,
          service_id: serviceId, package_id: kind === "base-200" ? packageId : null,
          served_by_id: kind === "peer" ? managerId : employeeId,
          status: kind === "pending" ? "PENDING" : kind === "cancelled" ? "CANCELLED" : "COMPLETED",
          cancelled_at: kind === "cancelled-at" ? now : null,
          price: kind === "base-zero" ? 999 : 500, final_price: 500,
          commission_base: kind === "base-200" ? 200 : kind === "base-zero" ? 0 : 100,
          completed_at: new Date(now.getTime() - (20 - index) * 60000),
        } });
        if (index < 3) eligibleServices.push(row.id); else excludedServices.push(row.id);
        if (kind === "paid") previouslyPaidService = row.id;
      }
    } catch (error) { try { await cleanup(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Payroll fixture setup and cleanup failed"); } throw error; }
  });
  beforeEach(async () => {
    vi.setSystemTime(now); controls.failure = null; controls.reached = false; controls.auth.mockReset(); controls.invalidate.mockReset(); controls.transaction.mockReset(); authenticate();
    await prisma.employee.update({ where: { id: employeeId }, data: { business_id: business.id, daily_rate: 100, commission_percentage: 10 } });
    await prisma.employee.update({ where: { id: managerId }, data: { profile: "MANAGER", business_id: business.id } });
    await prisma.employeeAttendance.updateMany({ where: { employee: { business_id: { in: tenants } } }, data: { paid_in_payslip_id: null } });
    await prisma.availedService.updateMany({ where: { booking: { business_id: { in: tenants } } }, data: { paid_in_payslip_id: null } });
    await prisma.auditLog.deleteMany({ where: { business_id: { in: tenants } } });
    await prisma.payslip.deleteMany({ where: { employee: { business_id: { in: tenants } } } });
    previousId = (await prisma.payslip.create({ data: { employee_id: employeeId, starting_date: new Date("2029-12-01T09:00:00Z"), ending_date: previousRelease, released_at: previousRelease, status: "PAID", total_salary: 77 } })).id;
    await prisma.employeeAttendance.update({ where: { id: previouslyPaidAttendance }, data: { paid_in_payslip_id: previousId } });
    await prisma.availedService.update({ where: { id: previouslyPaidService }, data: { paid_in_payslip_id: previousId } });
  });
  afterAll(async () => { controls.failure = null; try { await cleanup(); } finally { vi.useRealTimers(); await prisma.$disconnect(); } });

  it("previews only unpaid eligible attendance and completed paid-tenant services without mutation", async () => {
    const before = await snapshot(); const result = await getPayslipDataAction(employeeId);
    expect(result).toMatchObject({ success: true, data: { period: { start: previousRelease, end: now }, total_salary: 230, breakdown: { days_present: 1, paid_leave_days: 1, basic_salary: 200, commission_total: 30, commission_services_count: 3 } } });
    if (!result.success || !("data" in result) || !result.data) throw new Error("Expected preview DTO");
    expect(result.data.breakdown.attendance_dates).toHaveLength(2);
    expect(result.data.breakdown.commission_services.map(row => row.id)).toEqual(eligibleServices);
    expect(result.data.breakdown.commission_services[0]).toMatchObject({ commission_base: 200, package: { name: "Fixture package" }, service: { name: factory.service().name }, booking: { customer_label: "Fixture walk-in" } });
    expect(await snapshot()).toEqual(before);
  });
  it("commits release, exact forensic audit and all selected stamps together", async () => {
    const before = await snapshot(); const result = await release();
    expect(result).toMatchObject({ success: true, data: { payslip: { employee_id: employeeId, status: "PAID", starting_date: previousRelease, ending_date: now, released_at: now, deduction: 15.55, total_salary: 214.45 }, breakdown: { days_present: 1, paid_leave_days: 1, basic_salary: 200, commission_total: 30, gross_salary: 230, deduction: 15.55, net_salary: 214.45 } } });
    if (!result.success || !("data" in result) || !result.data) throw new Error("Expected released payslip");
    const id = result.data.payslip.id; const after = await snapshot();
    expect(after.payslips).toHaveLength(2); expect(after.payslips.find(row => row.id === previousId)).toEqual(before.payslips[0]);
    expect(after.attendance.filter(row => eligibleAttendance.includes(row.id)).map(row => row.paid_in_payslip_id)).toEqual([id, id, id]);
    expect(after.services.filter(row => eligibleServices.includes(row.id)).map(row => row.paid_in_payslip_id)).toEqual([id, id, id]);
    expect(after.attendance.filter(row => excludedAttendance.includes(row.id))).toEqual(before.attendance.filter(row => excludedAttendance.includes(row.id)));
    expect(after.services.filter(row => excludedServices.includes(row.id))).toEqual(before.services.filter(row => excludedServices.includes(row.id)));
    expect(after.audits).toHaveLength(1);
    expect(after.audits[0]).toMatchObject({ entity_type: "Payslip", entity_id: String(id), action: "CREATED", actor_id: users[0].id, actor_type: "USER", business_id: business.id, changes: { after: { employee_id: employeeId, starting_date: previousRelease.toISOString(), ending_date: now.toISOString(), released_at: now.toISOString(), days_present: 1, paid_leave_days: 1, basic_salary: 200, commission_total: 30, gross_salary: 230, deduction: 15.55, net_salary: 214.45, comment: "Fixture released payroll", attendance_count: 3, services_count: 3 } } });
    expect(controls.transaction).toHaveBeenCalledWith({ isolationLevel: "Serializable" }); expect(controls.auth).toHaveBeenCalledWith({ write: true }); expect(controls.invalidate).toHaveBeenCalledWith(`/app/${business.slug}/payroll`);
  });
  it.each(["payslip", "audit", "attendance", "services"] as const)("rolls back every actual write after injected %s failure", async stage => {
    const before = await snapshot(); controls.failure = stage;
    expect(await release()).toEqual({ success: false, error: "Failed to create payslip" });
    expect(controls.reached).toBe(true); expect(await snapshot()).toEqual(before); expect(controls.invalidate).not.toHaveBeenCalled();
  });
  it("caps deductions at gross pay rather than releasing negative salary", async () => { expect(await release(999)).toMatchObject({ success: true, data: { payslip: { total_salary: 0, deduction: 230 }, breakdown: { gross_salary: 230, net_salary: 0, deduction: 230 } } }); });
  it("rounds persisted and audited monetary amounts consistently", async () => {
    await prisma.employee.update({ where: { id: employeeId }, data: { daily_rate: 100.123 } });
    expect(await release(0)).toMatchObject({ success: true, data: { payslip: { total_salary: 230.25 }, breakdown: { basic_salary: 200.25, gross_salary: 230.25 } } });
    expect((await audits())[0].changes).toMatchObject({ after: { basic_salary: 200.25, gross_salary: 230.25, net_salary: 230.25 } });
  });
  it("does not repay stamped rows on a later legacy zero-value release", async () => {
    expect((await release()).success).toBe(true); const before = await snapshot(); vi.setSystemTime(new Date(now.getTime() + 1000));
    expect(await release()).toMatchObject({ success: true, data: { payslip: { total_salary: 0, deduction: 0 }, breakdown: { days_present: 0, paid_leave_days: 0, commission_total: 0, gross_salary: 0 } } });
    const after = await snapshot(); expect(after.attendance).toEqual(before.attendance); expect(after.services).toEqual(before.services); expect(after.payslips).toHaveLength(3);
  });
  it("maps an actual duplicate period constraint failure without stamps or audit", async () => {
    await prisma.payslip.create({ data: { employee_id: employeeId, starting_date: now, ending_date: now, released_at: now, total_salary: 0, status: "PAID" } });
    const before = await snapshot(); expect(await release()).toEqual({ success: false, error: "A payslip for this period already exists. Refresh and try again." });
    expect(await snapshot()).toEqual(before); expect(controls.invalidate).not.toHaveBeenCalled();
  });
  it("denies a non-owner create adapter with the actual employee graph unchanged", async () => { authenticate(users[1]); await assertDenied(() => release()); expect(controls.transaction).not.toHaveBeenCalled(); });
  it.each(["create", "preview", "history", "audit"] as const)("denies unauthenticated %s before any transaction", async kind => {
    controls.auth.mockResolvedValue({ success: false, error: "Unauthorized" });
    await assertDenied(() => kind === "create" ? release() : kind === "preview" ? getPayslipDataAction(employeeId) : kind === "history" ? getPayslipHistoryAction(employeeId) : getEmployeePayslipAuditAction(employeeId)); expect(controls.transaction).not.toHaveBeenCalled();
  });
  it("denies malformed creation input without persistence", async () => { await assertDenied(() => createPayslipAction({ employeeId, comment: "x".repeat(2001) })); expect(controls.transaction).not.toHaveBeenCalled(); });
  it.each(["create", "preview", "history", "audit"] as const)("denies foreign employee %s under the verified local tenant", async kind => {
    await assertDenied(() => kind === "create" ? createPayslipAction({ employeeId: foreignEmployeeId }) : kind === "preview" ? getPayslipDataAction(foreignEmployeeId) : kind === "history" ? getPayslipHistoryAction(foreignEmployeeId) : getEmployeePayslipAuditAction(foreignEmployeeId));
  });
  it("denies the local employee when authenticated in the foreign tenant", async () => { authenticate(users[3], foreign.slug); await assertDenied(() => release()); expect(controls.transaction).not.toHaveBeenCalled(); });
  it("denies a target transferred before the service precheck", async () => { await prisma.employee.update({ where: { id: employeeId }, data: { business_id: foreign.id } }); await assertDenied(() => release()); expect(controls.transaction).not.toHaveBeenCalled(); });
  it("allows employee self preview/history but denies another actual employee", async () => {
    authenticate(users[1]); expect((await getPayslipDataAction(employeeId)).success).toBe(true); expect(await getPayslipHistoryAction(employeeId)).toMatchObject({ success: true, data: [{ id: previousId }] });
    await assertDenied(() => getPayslipDataAction(managerId)); await assertDenied(() => getPayslipHistoryAction(managerId));
  });
  it("returns only employee-owned history ordered by ending date", async () => {
    expect((await release()).success).toBe(true);
    await prisma.payslip.create({ data: { employee_id: foreignEmployeeId, starting_date: previousRelease, ending_date: now, total_salary: 999, status: "PAID" } });
    const result = await getPayslipHistoryAction(employeeId); expect(result.success).toBe(true);
    if (!result.success || !("data" in result) || !result.data) throw new Error("Expected history");
    expect(result.data.map(row => row.employee_id)).toEqual([employeeId, employeeId]); expect(result.data.map(row => row.ending_date)).toEqual([now, previousRelease]);
  });
  it("filters audit collisions by tenant and entity type and exposes the committed DTO", async () => {
    expect((await release()).success).toBe(true); const committed = (await audits())[0];
    await prisma.auditLog.create({ data: { business_id: foreign.id, entity_type: "Payslip", entity_id: committed.entity_id, action: "CREATED", changes: { secret: "foreign fixture" } } });
    await prisma.auditLog.create({ data: { business_id: business.id, entity_type: "Booking", entity_id: committed.entity_id, action: "CREATED" } });
    expect(await getEmployeePayslipAuditAction(employeeId)).toEqual({ success: true, data: [{ id: committed.id, payslipId: committed.entity_id, action: "CREATED", actorId: users[0].id, changes: committed.changes, createdAt: committed.created_at.toISOString() }] });
  });
  it("allows actual same-tenant MANAGER audit but denies STAFF and foreign caller memberships", async () => {
    expect((await release()).success).toBe(true); authenticate(users[2]); expect(await getEmployeePayslipAuditAction(employeeId)).toMatchObject({ success: true, data: [{ actorId: users[0].id }] });
    await prisma.employee.update({ where: { id: managerId }, data: { profile: "STAFF" } }); await assertDenied(() => getEmployeePayslipAuditAction(employeeId));
    authenticate(users[4]); await assertDenied(() => getEmployeePayslipAuditAction(employeeId));
  });
  it("returns an empty audit for an actual tenant employee without payslips", async () => { expect(await getEmployeePayslipAuditAction(managerId)).toEqual({ success: true, data: [] }); });
});
