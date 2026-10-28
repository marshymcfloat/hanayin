import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmployeeAction, deleteEmployeeAction, getEmployeeScheduleAction, getEmployeesAction, resetEmployeePasswordAction, resendEmployeeInviteAction, updateEmployeeAction, upsertEmployeeScheduleAction } from "@/features/workforce/actions/employees";
import { getDefaultPermissionsForProfile } from "@/lib/auth/staff-access";
import { publicUserSelect } from "@/lib/auth/public-user";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), business: vi.fn(), user: vi.fn(), employees: vi.fn(), employee: vi.fn(), scheduleRead: vi.fn(), txBusiness: vi.fn(), txUser: vi.fn(), txEmployee: vi.fn(), businessName: vi.fn(), userCreate: vi.fn(), employeeCreate: vi.fn(), accountWrite: vi.fn(), employeeWrite: vi.fn(), employeeDelete: vi.fn(), owner: vi.fn(), txOwner: vi.fn(), settings: vi.fn(), scheduleDelete: vi.fn(), scheduleCreate: vi.fn(), transaction: vi.fn(), hash: vi.fn(), sms: vi.fn(), cache: vi.fn(), conflicts: vi.fn(), warning: vi.fn(), rollback: vi.fn(), foreignEdge: false, committed: false }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/lib/services/employee-invite", () => ({ sendEmployeeInviteSms: mocks.sms }));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: mocks.conflicts }));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warning } }));
vi.mock("@/lib/services/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { owner: { findFirst: mocks.owner }, business: { findUnique: mocks.business }, user: { findUnique: mocks.user }, employee: { findFirst: mocks.employee, findMany: mocks.employees }, employeeSchedule: { findMany: mocks.scheduleRead }, $transaction: mocks.transaction } }));

const now = new Date("2030-01-15T09:00:00Z"); const past = new Date("2030-01-01T00:00:00Z");
const business = { id: "biz", slug: "tenant", structure: "EMPLOYEE_LED", allow_employee_self_booking: true, manager_can_serve: true };
const owner = { id: "owner", role: "OWNER", owner: { id: 1, business_id: "biz" }, employee: null };
const member = { id: "owner", role: "EMPLOYEE", owner: null, employee: { id: 9, business_id: "biz", profile: "STAFF", permissions: [] } };
const account = { id: "staff", name: "Staff", contact_number: "639171234567", role: "EMPLOYEE", created_at: past, updated_at: past, hashed_password: "fixture-old-hash", must_change_password: true, temp_password_expires_at: past };
const employee = { id: 7, business_id: "biz", user_id: "staff", user: account, business: { name: "Tenant" }, profile: "STAFF", permissions: [], specialties: [], recurring_days_off: [], daily_rate: 100, commission_percentage: 10 };
const input = { name: "Staff", contact_number: "09171234567", daily_rate: 100, commission_percentage: 10 };
const rows = [{ day_of_week: 1, start_time: "09:00", end_time: "12:00" }, { day_of_week: 1, start_time: "13:00", end_time: "17:00" }];
const tx = { owner: { findFirst: mocks.txOwner }, payrollSettings: { findUnique: mocks.settings }, business: { findUnique: mocks.txBusiness, findFirst: mocks.businessName }, user: { findUnique: mocks.txUser, create: mocks.userCreate, updateMany: mocks.accountWrite }, employee: { findFirst: mocks.txEmployee, create: mocks.employeeCreate, updateMany: mocks.employeeWrite, deleteMany: mocks.employeeDelete }, employeeSchedule: { deleteMany: mocks.scheduleDelete, createMany: mocks.scheduleCreate } };
const writes = { update: () => updateEmployeeAction(7, { name: "Changed", specialties: ["Hair"] }), delete: () => deleteEmployeeAction(7), reset: () => resetEmployeePasswordAction(7, "fixture-known"), invite: () => resendEmployeeInviteAction(7), schedule: () => upsertEmployeeScheduleAction(7, rows), create: () => createEmployeeAction(input) };
function employmentHistory() {
  mocks.txEmployee.mockResolvedValue({ ...employee, employment_start: new Date("2026-01-01"), employment_end: null, financial_revision: 3 });
  const history = Object.fromEntries(["payrollStatement", "payslip", "compensationAgreement", "payrollEarning", "employeeAttendance", "workforceSession"].map(name => [name, { findFirst: vi.fn().mockResolvedValue(null) }]));
  Object.assign(tx, history); return history;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); mocks.foreignEdge = false; mocks.committed = false;
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "owner", role: "OWNER" } } });
  mocks.business.mockResolvedValue(business); mocks.txBusiness.mockResolvedValue(business);
  mocks.user.mockImplementation(async ({ where }) => where.id ? owner : null); mocks.txUser.mockImplementation(async ({ where }) => where.id ? owner : null);
  mocks.employee.mockResolvedValue(employee); mocks.txEmployee.mockImplementation(async ({ where }) => where.OR ? mocks.foreignEdge ? { id: 7 } : null : employee);
  mocks.employees.mockResolvedValue([employee]); mocks.scheduleRead.mockResolvedValue(rows); mocks.businessName.mockResolvedValue({ id: "biz", name: "Tenant" });
  mocks.hash.mockResolvedValue("fixture-new-hash"); mocks.userCreate.mockResolvedValue({ id: "staff" }); mocks.employeeCreate.mockResolvedValue(employee);
  mocks.owner.mockResolvedValue({ id: 1 }); mocks.txOwner.mockResolvedValue({ id: 1 }); mocks.settings.mockResolvedValue({ mode: "LEGACY" });
  mocks.accountWrite.mockResolvedValue({ count: 1 }); mocks.employeeWrite.mockResolvedValue({ count: 1 }); mocks.employeeDelete.mockResolvedValue({ count: 1 }); mocks.scheduleDelete.mockResolvedValue({ count: 2 }); mocks.scheduleCreate.mockImplementation(async ({ data }) => ({ count: data.length }));
  mocks.sms.mockImplementation(async () => { expect(mocks.committed).toBe(true); return { success: true }; });
  mocks.conflicts.mockImplementation(async () => { expect(mocks.committed).toBe(true); });
  mocks.transaction.mockImplementation(async work => { try { const result = await work(tx); mocks.committed = true; return result; } catch (error) { mocks.rollback(); throw error; } });
});
afterEach(() => vi.useRealTimers());

describe("employee administration validation and member reads", () => {
  it("validates Joined on as a real calendar date before authentication", async () => {
    expect((await updateEmployeeAction(7, { employment_start: "2026-02-30" })).success).toBe(false);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("saves a reviewed Joined on correction without writing rates or separation dates", async () => {
    employmentHistory();
    expect(await updateEmployeeAction(7, { employment_start: "2025-12-01", expectedFinancialRevision: 3 })).toMatchObject({ success: true });
    const write = mocks.employeeWrite.mock.calls[0][0];
    expect(write.where).toMatchObject({ id: 7, business_id: "biz", financial_revision: 3 });
    expect(write.data).toEqual({ user_id: "staff", employment_start: new Date("2025-12-01"), financial_revision: { increment: 1 } });
  });
  it("requires current payroll permission and revision for Joined on changes", async () => {
    employmentHistory(); mocks.txOwner.mockResolvedValue(null);
    expect(await updateEmployeeAction(7, { employment_start: "2025-12-01", expectedFinancialRevision: 3 })).toMatchObject({ success: false, error: expect.stringContaining("Payroll permission") });
    mocks.txOwner.mockResolvedValue({ id: 1 });
    expect(await updateEmployeeAction(7, { employment_start: "2025-12-01", expectedFinancialRevision: 2 })).toMatchObject({ success: false, error: expect.stringContaining("records changed") });
    expect(mocks.employeeWrite).not.toHaveBeenCalled();
  });
  it("protects saved payroll before any profile or account write", async () => {
    const history = employmentHistory(); history.payrollStatement.findFirst.mockResolvedValue({ id: "published" });
    expect(await updateEmployeeAction(7, { name: "Must not commit", employment_start: "2025-12-01", expectedFinancialRevision: 3 })).toMatchObject({ success: false, error: expect.stringContaining("reviewed correction") });
    expect(mocks.accountWrite).not.toHaveBeenCalled(); expect(mocks.employeeWrite).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 2_147_483_648, Number.NaN, Number.POSITIVE_INFINITY, "7"])("rejects malformed employee ID%s before auth", async id => {
    expect((await updateEmployeeAction(id as number, {})).success).toBe(false); expect((await deleteEmployeeAction(id as number)).success).toBe(false); expect((await resetEmployeePasswordAction(id as number, "x")).success).toBe(false); expect((await resendEmployeeInviteAction(id as number)).success).toBe(false); expect((await getEmployeeScheduleAction(id as number)).success).toBe(false); expect((await upsertEmployeeScheduleAction(id as number, [])).success).toBe(false); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each([{ name: "" }, { name: "x".repeat(201) }, { contact_number: "x".repeat(51) }, { daily_rate: -1 }, { daily_rate: Number.POSITIVE_INFINITY }, { commission_percentage: 101 }, { profile: "INVALID" }, { permissions: ["INVALID"] }, { specialties: [""] }, { recurring_days_off: [Number.NaN] }])("validates create/update fields%j without persistence", async invalid => {
    expect((await createEmployeeAction({ ...input, ...invalid } as typeof input)).success).toBe(false);
    expect((await updateEmployeeAction(7, invalid as Parameters<typeof updateEmployeeAction>[1])).success).toBe(false); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each(["", "x".repeat(1025), null, 42])("rejects malformed reset password%s without hashing", async password => {
    expect((await resetEmployeePasswordAction(7, password as string)).success).toBe(false); expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("adds no new minimum password strength policy", async () => {
    expect(await resetEmployeePasswordAction(7, "x")).toEqual({ success: true }); expect(mocks.hash).toHaveBeenCalledWith("x", 12);
  });
  it.each([{ day_of_week: -1, start_time: "09:00", end_time: "17:00" }, { day_of_week: 7, start_time: "09:00", end_time: "17:00" }, { day_of_week: 1.5, start_time: "09:00", end_time: "17:00" }, { day_of_week: 1, start_time: "24:00", end_time: "17:00" }, { day_of_week: 1, start_time: "9:00", end_time: "17:00" }, { day_of_week: 1, start_time: "09:00", end_time: "09:00" }])("rejects malformed schedule%j before transactions", async row => {
    expect((await upsertEmployeeScheduleAction(7, [row])).success).toBe(false); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects unbounded or malformed schedule collections", async () => {
    expect((await upsertEmployeeScheduleAction(7, Array.from({ length: 1001 }, () => rows[0]))).success).toBe(false); expect((await upsertEmployeeScheduleAction(7, null as unknown as typeof rows)).success).toBe(false); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("repeats actual stored membership and tenant on list/schedule queries", async () => {
    const result = await getEmployeesAction(); expect(result).toMatchObject({ success: true, data: [{ user: { id: "staff", name: "Staff" } }] });
    expect(JSON.stringify(result)).not.toMatch(/hashed_password|must_change_password|temp_password_expires_at/);
    expect(mocks.employees).toHaveBeenCalledWith(expect.objectContaining({ where: { business_id: "biz", archived_at: null, business: { id: "biz", slug: "tenant", owners: { some: { id: 1, business_id: "biz", user_id: "owner", user: { role: "OWNER" }, permissions: { has: "EMPLOYEES_MANAGE" } } } } }, include: expect.objectContaining({ user: { select: publicUserSelect }, attendance: expect.objectContaining({ where: { OR: [{ paid_in_payslip_id: null }, { paid_in_payslip: { is: { employee: { business_id: "biz" } } } }] }, orderBy: { date: "desc" }, take: 7 }), payslips: expect.objectContaining({ where: { NOT: { OR: expect.any(Array) } }, orderBy: { ending_date: "desc" }, take: 1 }), _count: { select: { served_services: { where: { NOT: { OR: expect.any(Array) } } } } } }) }));
    expect(await getEmployeeScheduleAction(7)).toEqual({ success: true, data: rows });
    expect(mocks.scheduleRead).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employee_id: 7, employee: expect.objectContaining({ id: 7, business_id: "biz", business: expect.objectContaining({ owners: expect.any(Object) }) }) }) }));
  });
  it("preserves current employee viewing another tenant employee schedule", async () => {
    mocks.user.mockResolvedValue(member);
    expect(await getEmployeeScheduleAction(7)).toEqual({ success: true, data: rows }); expect(await getEmployeesAction()).toMatchObject({ success: true });
  });
  it.each([null, { ...owner, role: "CUSTOMER" }, { ...owner, owner: null }, { ...owner, owner: { id: 1, business_id: "foreign" } }])("rejects missing/stale member%j before reads", async actor => {
    mocks.user.mockResolvedValue(actor); expect((await getEmployeesAction()).success).toBe(false); expect((await getEmployeeScheduleAction(7)).success).toBe(false); expect(mocks.employees).not.toHaveBeenCalled(); expect(mocks.scheduleRead).not.toHaveBeenCalled();
  });
  it("denies a foreign target schedule before protected schedule data", async () => {
    mocks.employee.mockResolvedValue(null); expect(await getEmployeeScheduleAction(99)).toEqual({ success: false, error: "Employee not found" }); expect(mocks.scheduleRead).not.toHaveBeenCalled();
  });
  it.each(["list", "schedule"])("returns safe thrown %s read errors", async operation => {
    (operation === "list" ? mocks.employees : mocks.scheduleRead).mockRejectedValue(new Error("private fixture SQL"));
    expect(await (operation === "list" ? getEmployeesAction() : getEmployeeScheduleAction(7))).toEqual({ success: false, error: operation === "list" ? "Failed to fetch employees" : "Failed to fetch schedule." });
  });
});

describe("current-owner commands and atomic account changes", () => {
  it.each(Object.keys(writes) as (keyof typeof writes)[])("requires actual current OWNER for%s", async operation => {
    mocks.user.mockResolvedValue(member); expect(await writes[operation]()).toEqual({ success: false, error: "Forbidden" }); expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
  });
  it.each(Object.keys(writes) as (keyof typeof writes)[])("rechecks current OWNER in%s transaction", async operation => {
    mocks.txUser.mockResolvedValue({ ...owner, role: "CUSTOMER" }); expect(await writes[operation]()).toEqual({ success: false, error: "Forbidden" }); expect(mocks.accountWrite).not.toHaveBeenCalled(); expect(mocks.employeeWrite).not.toHaveBeenCalled(); expect(mocks.userCreate).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
  });
  it.each(Object.keys(writes) as (keyof typeof writes)[])("preserves write subscription denial and safe auth failure for%s", async operation => {
    mocks.auth.mockResolvedValue({ success: false, error: "Subscription inactive" }); expect(await writes[operation]()).toEqual({ success: false, error: "Subscription inactive" }); expect(mocks.user).not.toHaveBeenCalled();
    mocks.auth.mockRejectedValue(new Error("private fixture auth")); expect((await writes[operation]()).success).toBe(false); expect(mocks.user).not.toHaveBeenCalled();
  });
  it("keeps profile permission defaults and days-off sanitization on create", async () => {
    expect((await createEmployeeAction({ ...input, profile: "MANAGER", permissions: [], recurring_days_off: [6, 2, 2, -1, 7, 1.5] })).success).toBe(true);
    expect(mocks.employeeCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ profile: "MANAGER", permissions: getDefaultPermissionsForProfile("MANAGER"), recurring_days_off: [2, 6] }) }));
    expect(mocks.hash.mock.invocationCallOrder[0]).toBeLessThan(mocks.transaction.mock.invocationCallOrder[0]);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  });
  it("rejects invalid phone normalization without hashing or persistence", async () => {
    expect(await createEmployeeAction({ ...input, contact_number: "invalid" })).toMatchObject({ success: false, error: expect.stringContaining("valid Philippine") }); expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
    expect((await updateEmployeeAction(7, { contact_number: "invalid" })).success).toBe(false);
  });
  it("rejects contact collisions outside and inside create transaction", async () => {
    mocks.user.mockImplementation(async ({ where }) => where.id ? owner : { id: "other" });
    expect(await createEmployeeAction(input)).toEqual({ success: false, error: "Contact number already in use" }); expect(mocks.hash).not.toHaveBeenCalled();
    mocks.user.mockImplementation(async ({ where }) => where.id ? owner : null); mocks.txUser.mockImplementation(async ({ where }) => where.id ? owner : { id: "other" });
    expect(await createEmployeeAction(input)).toEqual({ success: false, error: "Contact number already in use" }); expect(mocks.userCreate).not.toHaveBeenCalled();
  });
  it("safely handles unique contact race with rollback and no SMS", async () => {
    mocks.userCreate.mockRejectedValue({ code: "P2002", message: "private fixture SQL" });
    expect(await createEmployeeAction(input)).toEqual({ success: false, error: "Contact number already in use" }); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.sms).not.toHaveBeenCalled();
  });
  it("updates account and employee using tenant/current-owner predicates and existing defaults", async () => {
    expect(await updateEmployeeAction(7, { name: "Changed", profile: "CASHIER", recurring_days_off: [0, 0, 8], specialties: [] })).toEqual({ success: true });
    expect(mocks.accountWrite).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "staff", role: "EMPLOYEE", owner: { is: null }, employee: { is: expect.objectContaining({ business_id: "biz", business: expect.objectContaining({ owners: expect.any(Object) }) }) } }), data: { name: "Changed" } }));
    expect(mocks.employeeWrite).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 7, business_id: "biz", user_id: "staff", profile: "STAFF" }), data: expect.objectContaining({ profile: "CASHIER", permissions: getDefaultPermissionsForProfile("CASHIER"), recurring_days_off: [0] }) }));
    expect(mocks.conflicts).toHaveBeenCalledWith({ businessSlug: "tenant", trigger: "EMPLOYEE_SPECIALTIES_UPDATED" });
  });
  it("does not reset permissions when updating unrelated fields or an empty payload", async () => {
    expect(await updateEmployeeAction(7, { daily_rate: 0 })).toEqual({ success: true }); expect(mocks.employeeWrite.mock.calls[0][0].data).not.toHaveProperty("permissions");
    expect(await updateEmployeeAction(7, {})).toEqual({ success: true }); expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it("rejects update contact collisions without changes", async () => {
    mocks.txUser.mockImplementation(async ({ where }) => where.id ? owner : { id: "other" });
    expect(await updateEmployeeAction(7, { contact_number: "09181234567" })).toEqual({ success: false, error: "Contact number already in use" }); expect(mocks.accountWrite).not.toHaveBeenCalled();
  });
  it.each(["update", "reset", "invite"] as const)("rejects lost account CAS for%s without success side effects", async operation => {
    mocks.accountWrite.mockResolvedValue({ count: 0 }); expect(await writes[operation]()).toEqual({ success: false, error: "Employee changed. Please try again." }); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.sms).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("rejects a lost employee CAS after account update, triggering rollback", async () => {
    mocks.employeeWrite.mockResolvedValue({ count: 0 }); expect((await writes.update()).success).toBe(false); expect(mocks.accountWrite).toHaveBeenCalledOnce(); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it.each(["reset", "invite"] as const)("rejects swapped account binding on%s before account write", async operation => {
    mocks.txEmployee.mockResolvedValue({ ...employee, user_id: "swapped" }); expect((await writes[operation]()).success).toBe(false); expect(mocks.accountWrite).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
  });
  it.each(["reset", "invite"] as const)("hashes%s outside locks and guards exact previous credentials", async operation => {
    expect((await writes[operation]()).success).toBe(true); expect(mocks.hash.mock.invocationCallOrder[0]).toBeLessThan(mocks.transaction.mock.invocationCallOrder[0]);
    expect(mocks.accountWrite).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ hashed_password: "fixture-old-hash", must_change_password: true, temp_password_expires_at: past, updated_at: past, contact_number: "639171234567" }) }));
  });
  it("rejects invite without stored contact or failed hash before persistence", async () => {
    mocks.employee.mockResolvedValue({ ...employee, user: { ...account, contact_number: "" } }); expect(await resendEmployeeInviteAction(7)).toEqual({ success: false, error: "Employee has no contact number." }); expect(mocks.hash).not.toHaveBeenCalled();
    mocks.employee.mockResolvedValue(employee); mocks.hash.mockRejectedValue(new Error("private fixture hash")); expect((await resetEmployeePasswordAction(7, "x")).success).toBe(false); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["create", "update", "delete", "reset", "invite", "schedule"] as const)("safely rejects serializable failure for%s without retries", async operation => {
    mocks.transaction.mockRejectedValue({ code: "P2034", message: "private fixture SQL" }); expect((await writes[operation]()).success).toBe(false); expect(mocks.transaction).toHaveBeenCalledOnce(); expect(mocks.sms).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
});

describe("employee archival integrity and schedule replacement", () => {
  it("archives only the tenant-bound employee while preserving the user and financial history", async () => {
    expect(await deleteEmployeeAction(7)).toEqual({ success: true });
    expect(mocks.employeeWrite).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 7, user_id: "staff", business_id: "biz", NOT: { OR: expect.any(Array) } }), data: { archived_at: now, employment_end: new Date("2030-01-15T00:00:00Z") } })); expect(mocks.employeeDelete).not.toHaveBeenCalled(); expect(mocks.accountWrite).not.toHaveBeenCalled(); expect(mocks.employeeWrite.mock.calls[0][0].data).not.toHaveProperty("salary");
  });
  it.each(["served_services", "brand_assets", "leave_requests", "attendance", "payslips"])("checks malformed foreign%s backlinks before archival", async relation => {
    mocks.foreignEdge = true; expect(await deleteEmployeeAction(7)).toEqual({ success: false, error: "Employee references are inconsistent. Contact support." }); expect(mocks.employeeWrite).not.toHaveBeenCalled(); expect(mocks.employeeDelete).not.toHaveBeenCalled();
    const query = mocks.txEmployee.mock.calls.find(([args]) => args.where.OR)?.[0]; expect(query.where.OR).toEqual(expect.arrayContaining([expect.objectContaining({ [relation]: expect.any(Object) })])); expect(JSON.stringify(query)).toContain('"not":"biz"');
  });
  it("rejects lost conditional archive update without reporting success", async () => {
    mocks.employeeWrite.mockResolvedValue({ count: 0 }); expect((await deleteEmployeeAction(7)).success).toBe(false); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("scopes replace-all delete and locks verified parent using conditional no-op CAS", async () => {
    expect(await upsertEmployeeScheduleAction(7, rows)).toEqual({ success: true });
    expect(mocks.employeeWrite).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 7, business_id: "biz", user_id: "staff" }), data: { user_id: "staff" } }));
    expect(mocks.scheduleDelete).toHaveBeenCalledWith(expect.objectContaining({ where: { employee_id: 7, employee: expect.objectContaining({ id: 7, business_id: "biz", business: expect.objectContaining({ owners: expect.any(Object) }) }) } }));
  });
  it("keeps adjacent daytime ranges legal and empty replacement clears", async () => {
    expect(await upsertEmployeeScheduleAction(7, [rows[0], { ...rows[0], start_time: "12:00", end_time: "17:00" }])).toEqual({ success: true });
    expect(await upsertEmployeeScheduleAction(7, [])).toEqual({ success: true }); expect(mocks.scheduleCreate).toHaveBeenCalledOnce();
  });
  it.each(["lock", "insert", "partial"])("rolls back%s schedule replacement failure", async failure => {
    if (failure === "lock") mocks.employeeWrite.mockResolvedValue({ count: 0 }); if (failure === "insert") mocks.scheduleCreate.mockRejectedValue(new Error("private fixture SQL")); if (failure === "partial") mocks.scheduleCreate.mockResolvedValue({ count: 1 });
    expect((await upsertEmployeeScheduleAction(7, rows)).success).toBe(false); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.cache).not.toHaveBeenCalled();
  });
});

describe("postcommit employee provider/cache/logging failures", () => {
  it.each(["create", "invite"] as const)("preserves committed%s and existing fallback when SMS throws", async operation => {
    mocks.sms.mockRejectedValue(new Error("fixture SMS secret response")); mocks.cache.mockImplementation(() => { throw new Error("fixture cache unavailable"); }); mocks.warning.mockImplementation(() => { throw new Error("fixture logger unavailable"); });
    const result = await writes[operation](); expect(result).toMatchObject({ success: true, warning: expect.any(String) }); expect(mocks.rollback).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain("fixture SMS secret response");
    if (operation === "create") expect(result).not.toHaveProperty("tempPassword"); else expect(result).toHaveProperty("tempPassword", expect.stringMatching(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/));
  });
  it("does not leak generated credentials in optional warning logs", async () => {
    mocks.sms.mockResolvedValue({ success: false, error: "fixture private provider response" }); const result = await resendEmployeeInviteAction(7);
    expect(result.success).toBe(true); if (!("tempPassword" in result)) throw new Error("Expected one-time fallback"); expect(JSON.stringify(mocks.warning.mock.calls)).not.toContain(result.tempPassword); expect(JSON.stringify(mocks.warning.mock.calls)).not.toContain("fixture private provider response");
  });
  it("preserves committed specialty update even conflict notifier/cache/logger fail", async () => {
    mocks.conflicts.mockRejectedValue(new Error("fixture provider unavailable")); mocks.cache.mockImplementation(() => { throw new Error("fixture cache unavailable"); }); mocks.warning.mockImplementation(() => { throw new Error("fixture logger unavailable"); });
    expect(await writes.update()).toEqual({ success: true }); expect(mocks.rollback).not.toHaveBeenCalled();
  });
  it.each(["delete", "schedule"] as const)("preserves committed%s after cache refresh fails", async operation => {
    mocks.cache.mockImplementation(() => { throw new Error("fixture cache unavailable"); }); expect(await writes[operation]()).toEqual({ success: true }); expect(mocks.rollback).not.toHaveBeenCalled();
  });
});


describe("employee administration compensation boundaries", () => {
  it("redacts coworkers' salary, rates and payslips for an owner without exact payroll permission", async () => {
    mocks.owner.mockResolvedValue(null);
    mocks.employees.mockResolvedValue([{ ...employee, salary: 500, payslips: [{ id: 1, total_salary: 500 }] }]);
    expect(await getEmployeesAction()).toMatchObject({ success: true, data: [{ salary: null, daily_rate: null, commission_percentage: null, payslips: [] }] });
    expect(mocks.owner).toHaveBeenCalledWith({ where: { id: 1, user_id: "owner", business_id: "biz", user: { role: "OWNER" }, permissions: { has: "PAYROLL_MANAGE" } }, select: { id: true } });
  });
  it("allows an ordinary profile edit without payroll permission, but refuses rate writes", async () => {
    mocks.txOwner.mockResolvedValue(null);
    expect(await updateEmployeeAction(7, { name: "Updated profile" })).toEqual({ success: true });
    mocks.employeeWrite.mockClear(); mocks.accountWrite.mockClear();
    expect(await updateEmployeeAction(7, { daily_rate: 100 })).toEqual({ success: false, error: "Payroll permission is required to change compensation." });
    expect(mocks.employeeWrite).not.toHaveBeenCalled(); expect(mocks.accountWrite).not.toHaveBeenCalled();
  });
  it("refuses nonzero compensation on employee creation without payroll permission", async () => {
    mocks.txOwner.mockResolvedValue(null);
    expect(await createEmployeeAction(input)).toEqual({ success: false, error: "Payroll permission is required to set compensation." });
    expect(mocks.employeeCreate).not.toHaveBeenCalled(); expect(mocks.userCreate).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
  });
  it.each(["ACTIVE", "SHADOW"])("requires effective compensation agreements for %s rate changes", async mode => {
    mocks.settings.mockResolvedValue({ mode });
    expect(await updateEmployeeAction(7, { commission_percentage: 10 })).toMatchObject({ success: false, error: expect.stringContaining("effective-dated agreement") });
    expect(mocks.employeeWrite).not.toHaveBeenCalled();
    expect(await createEmployeeAction(input)).toMatchObject({ success: false, error: expect.stringContaining("zero legacy rates") });
    expect(mocks.userCreate).not.toHaveBeenCalled(); expect(mocks.employeeCreate).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
  });
});
