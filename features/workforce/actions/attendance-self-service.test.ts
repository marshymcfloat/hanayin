import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAttendanceStatusAction, clockInAction, clockOutAction, getMonthlyAttendanceAction } from "@/features/workforce/actions/attendance";
import { attendanceClockInputSchema, attendanceMonthlyInputSchema, attendanceStatusInputSchema } from "@/features/workforce/attendance-self-service-schemas";
import { clockInSelfServiceAttendance } from "@/features/workforce/services/attendance-self-service";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), business: vi.fn(), user: vi.fn(), employee: vi.fn(), read: vi.fn(), monthly: vi.fn(), txBusiness: vi.fn(), txUser: vi.fn(), txEmployee: vi.fn(), location: vi.fn(), txRead: vi.fn(), txOpen: vi.fn(), settings: vi.fn(), sessions: vi.fn(), sessionCreate: vi.fn(), sessionUpdate: vi.fn(), published: vi.fn(), create: vi.fn(), update: vi.fn(), transaction: vi.fn(), conflicts: vi.fn(), cache: vi.fn(), warning: vi.fn(), rollback: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: mocks.conflicts }));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warning } }));
vi.mock("@/prisma/prisma", () => ({ prisma: {
  business: { findUnique: mocks.business }, user: { findUnique: mocks.user }, employee: { findFirst: mocks.employee },
  employeeAttendance: { findFirst: mocks.read, findMany: mocks.monthly }, $transaction: mocks.transaction,
} }));

const now = new Date("2030-01-15T16:30:00Z");
const business = { id: "biz", slug: "tenant", structure: "EMPLOYEE_LED", allow_employee_self_booking: true, manager_can_serve: true };
const employeeUser = { id: "staff", role: "EMPLOYEE", owner: null, employee: { id: 7, business_id: "biz", profile: "STAFF", permissions: [] } };
const ownerUser = { id: "staff", role: "OWNER", employee: null, owner: { id: 1, business_id: "biz" } };
const row = { id: 8, employee_id: 7, date: new Date("2030-01-15T16:00:00Z"), time_in: now, time_out: null, status: "PRESENT", latitude: 14.5, longitude: 121, location_verified: true, revision: 0, paid_in_payslip_id: null };
const tx = { business: { findUnique: mocks.txBusiness, findFirst: mocks.location }, user: { findUnique: mocks.txUser }, employee: { findFirst: mocks.txEmployee }, payrollSettings: { findUnique: mocks.settings }, payrollEarning: { findFirst: mocks.published }, workforceSession: { findMany: mocks.sessions, create: mocks.sessionCreate, updateMany: mocks.sessionUpdate }, employeeAttendance: { findMany: mocks.txOpen, findFirst: mocks.txRead, create: mocks.create, updateMany: mocks.update } };
const membership = { id: "biz", slug: "tenant", employees: { some: { id: 7, user_id: "staff", business_id: "biz", user: { role: "EMPLOYEE" } } } };
const target = { id: 7, business_id: "biz", business: membership, user_id: "staff", user: { role: "EMPLOYEE" } };
const clock = (direction: "in" | "out") => direction === "in" ? clockInAction(7, 14.5, 121, "tenant") : clockOutAction(7, 14.5, 121, "tenant");
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "staff", role: "EMPLOYEE" } } });
  mocks.business.mockResolvedValue(business); mocks.txBusiness.mockResolvedValue(business);
  mocks.user.mockResolvedValue(employeeUser); mocks.txUser.mockResolvedValue(employeeUser);
  mocks.employee.mockResolvedValue({ id: 7 }); mocks.txEmployee.mockResolvedValue({ id: 7 });
  mocks.location.mockResolvedValue({ latitude: 14.5, longitude: 121 });
  mocks.read.mockResolvedValue(row); mocks.monthly.mockResolvedValue([row]); mocks.txRead.mockResolvedValue(null);
  mocks.create.mockResolvedValue(row); mocks.update.mockResolvedValue({ count: 1 });
  mocks.txOpen.mockResolvedValue([]); mocks.settings.mockResolvedValue(null); mocks.sessions.mockResolvedValue([]); mocks.published.mockResolvedValue(null); mocks.sessionUpdate.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async work => { try { return await work(tx); } catch (error) { mocks.rollback(); throw error; } });
});
afterEach(() => vi.useRealTimers());

describe("attendance transport and parsing", () => {
  it.each([0, -1, 1.5, 2_147_483_648, Number.NaN, Number.POSITIVE_INFINITY, "7"])("rejects employee ID %s before auth/persistence", async id => {
    expect(await checkAttendanceStatusAction(id as number, now)).toEqual({ success: false, error: "Invalid attendance query" });
    expect(await getMonthlyAttendanceAction(id as number, 2030, 0)).toEqual({ success: false, error: "Invalid attendance query" });
    expect(await clockInAction(id as number, 14.5, 121, "tenant")).toEqual({ success: false, error: "Invalid attendance input" });
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.business).not.toHaveBeenCalled();
  });
  it.each([new Date(Number.NaN), "2030-01-16", null, new Date(8_640_000_000_000_000)])("rejects invalid/unrepresentable date %s", async date => {
    expect(await checkAttendanceStatusAction(7, date as Date)).toMatchObject({ success: false }); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("returns safe validation denial when Philippine date normalization throws", async () => {
    const formatter = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () { throw new Error("Fixture normalization unavailable"); });
    try {
      expect(await checkAttendanceStatusAction(7, now)).toEqual({ success: false, error: "Invalid attendance query" });
      expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
    } finally { formatter.mockRestore(); }
  });
  it.each([[2030, -1], [2030, 12], [2030, 0.5], [0, 0], [10000, 0], [2030.1, 0], [Number.POSITIVE_INFINITY, 0], [2030, "0"]])("rejects invalid year/month %s %s", async (year, month) => {
    expect(await getMonthlyAttendanceAction(7, year as number, month as number)).toMatchObject({ success: false }); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each([[91, 121], [-91, 121], [14.5, 181], [14.5, -181], [Number.NaN, 121], [14.5, Number.POSITIVE_INFINITY], ["14.5", 121]])("rejects malformed GPS %s %s before protected work", async (latitude, longitude) => {
    expect(await clockInAction(7, latitude as number, longitude, "tenant")).toEqual({ success: false, error: "Invalid attendance input" });
    expect(await clockOutAction(7, latitude as number, longitude, "tenant")).toEqual({ success: false, error: "Invalid attendance input" });
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("accepts closed geographic bounds and the positive32bit maximum", () => {
    expect(attendanceClockInputSchema.safeParse({ employeeId: 2_147_483_647, latitude: -90, longitude: 180, businessSlug: "tenant" }).success).toBe(true);
    expect(attendanceClockInputSchema.safeParse({ employeeId: 1, latitude: 90, longitude: -180, businessSlug: "tenant" }).success).toBe(true);
    expect(attendanceStatusInputSchema.safeParse({ employeeId: 1, date: now }).success).toBe(true);
    expect(attendanceMonthlyInputSchema.safeParse({ employeeId: 1, year: 2030, month: 11 }).success).toBe(true);
  });
  it.each(["", "tenant/other", "x".repeat(201)])("rejects malformed business slug %s", async slug => {
    expect(await clockInAction(7, 14.5, 121, slug)).toMatchObject({ success: false }); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it.each(["status", "monthly", "in", "out"] as const)("passes auth denial without persistence for %s", async operation => {
    const denial = { success: false, error: "Subscription inactive" }; mocks.auth.mockResolvedValue(denial);
    const result = operation === "status" ? await checkAttendanceStatusAction(7, now) : operation === "monthly" ? await getMonthlyAttendanceAction(7, 2030, 0) : await clock(operation);
    expect(result).toEqual(denial); expect(mocks.business).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["status", "monthly", "in", "out"] as const)("returns safe thrown authentication errors for %s", async operation => {
    mocks.auth.mockRejectedValue(new Error("private fixture authentication"));
    const result = operation === "status" ? await checkAttendanceStatusAction(7, now) : operation === "monthly" ? await getMonthlyAttendanceAction(7, 2030, 0) : await clock(operation);
    expect(result).toEqual({ success: false, error: operation === "status" ? "Failed to check status" : operation === "monthly" ? "Failed to fetch monthly attendance" : `Failed to clock ${operation}` });
    expect(mocks.business).not.toHaveBeenCalled();
  });
  it.each(["in", "out"] as const)("crosschecks legacy slug before protected %s work", async direction => {
    const action = direction === "in" ? clockInAction : clockOutAction;
    expect(await action(7, 14.5, 121, "foreign")).toEqual({ success: false, error: "Unauthorized business context" });
    expect(mocks.business).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("current-member attendance reads", () => {
  it("uses actual stored employee role, tenant, membership and PH day bounds", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "staff", role: "OWNER" } } });
    expect(await checkAttendanceStatusAction(7, now)).toEqual({ success: true, data: row });
    expect(mocks.employee).toHaveBeenCalledWith({ where: target, select: { id: true } });
    expect(mocks.read).toHaveBeenCalledWith({ where: { employee_id: 7, employee: target, date: { gte: row.date, lte: new Date("2030-01-16T15:59:59.999Z") } } });
    expect(await checkAttendanceStatusAction(9, now)).toMatchObject({ success: false });
    expect(mocks.read).toHaveBeenCalledOnce();
  });
  it("allows actual current owners reading tenant employees", async () => {
    mocks.user.mockResolvedValue(ownerUser);
    expect(await getMonthlyAttendanceAction(7, 2030, 11)).toEqual({ success: true, data: [row] });
    expect(mocks.monthly).toHaveBeenCalledWith({ where: { employee_id: 7, employee: { id: 7, business_id: "biz", business: { id: "biz", slug: "tenant", owners: { some: { id: 1, user_id: "staff", business_id: "biz", user: { role: "OWNER" } } } } }, date: { gte: new Date("2030-11-30T16:00:00Z"), lte: new Date("2030-12-31T15:59:59.999Z") } } });
  });
  it.each([null, { ...employeeUser, role: "CUSTOMER" }, { ...employeeUser, employee: null }, { ...employeeUser, employee: { ...employeeUser.employee, business_id: "foreign" } }, { ...ownerUser, owner: { id: 1, business_id: "foreign" } }])("denies missing or stale current membership %j", async user => {
    mocks.user.mockResolvedValue(user);
    expect(await checkAttendanceStatusAction(7, now)).toMatchObject({ success: false });
    expect(await getMonthlyAttendanceAction(7, 2030, 0)).toMatchObject({ success: false });
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.monthly).not.toHaveBeenCalled();
  });
  it("denies foreign/missing target employees for owners", async () => {
    mocks.user.mockResolvedValue(ownerUser); mocks.employee.mockResolvedValue(null);
    expect(await checkAttendanceStatusAction(9, now)).toMatchObject({ success: false }); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("returns null and empty original result shapes", async () => {
    mocks.read.mockResolvedValue(null); mocks.monthly.mockResolvedValue([]);
    expect(await checkAttendanceStatusAction(7, now)).toEqual({ success: true, data: null });
    expect(await getMonthlyAttendanceAction(7, 2030, 0)).toEqual({ success: true, data: [] });
  });
  it.each(["membership", "day", "month"])("returns safe %s persistence failures", async location => {
    if (location === "membership") mocks.user.mockRejectedValue(new Error("private fixture SQL"));
    if (location === "day") mocks.read.mockRejectedValue(new Error("private fixture SQL"));
    if (location === "month") mocks.monthly.mockRejectedValue(new Error("private fixture SQL"));
    const result = location === "month" ? await getMonthlyAttendanceAction(7, 2030, 0) : await checkAttendanceStatusAction(7, now);
    expect(result).toEqual({ success: false, error: location === "month" ? "Failed to fetch monthly attendance" : "Failed to check status" });
  });
});

describe("atomic attendance self-service commands", () => {
  it("creates only verified PRESENT self attendance in a bounded serial transaction", async () => {
    expect(await clock("in")).toEqual({ success: true, data: row });
    expect(mocks.auth).toHaveBeenCalledWith({ write: true });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
    expect(mocks.txEmployee).toHaveBeenCalledWith({ where: target, select: { id: true } });
    expect(mocks.location).toHaveBeenCalledWith({ where: membership, select: { latitude: true, longitude: true } });
    expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.conflicts.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.create.mock.invocationCallOrder[0]);
    expect(mocks.cache).toHaveBeenCalledWith("/tenant");
  });
  it.each(["in", "out"] as const)("rejects owners clocking %s even with full owner permissions", async direction => {
    mocks.user.mockResolvedValue(ownerUser);
    expect(await clock(direction)).toMatchObject({ success: false }); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["in", "out"] as const)("rechecks actual current membership inside clock-%s transaction", async direction => {
    mocks.txUser.mockResolvedValue({ ...employeeUser, role: "CUSTOMER" });
    expect(await clock(direction)).toMatchObject({ success: false }); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it.each(["tenant", "employee", "target", "business"])("rejects %s changing between command access checks", async change => {
    if (change === "tenant") { mocks.txBusiness.mockResolvedValue({ ...business, id: "new-biz" }); mocks.txUser.mockResolvedValue({ ...employeeUser, employee: { ...employeeUser.employee, business_id: "new-biz" } }); }
    if (change === "employee") mocks.txUser.mockResolvedValue({ ...employeeUser, employee: { ...employeeUser.employee, id: 9 } });
    if (change === "target") mocks.txEmployee.mockResolvedValue(null);
    if (change === "business") mocks.txBusiness.mockResolvedValue(null);
    expect(await clock("in")).toMatchObject({ success: false }); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it.each(["in", "out"] as const)("denies clock-%s outside existing100m policy without write", async direction => {
    mocks.location.mockResolvedValue({ latitude: 14.51, longitude: 121 });
    expect(await clock(direction)).toMatchObject({ success: false, error: expect.stringContaining("Max allowed: 100m") });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it.each([null, { latitude: null, longitude: 121 }, { latitude: 14.5, longitude: null }])("denies unset tenant location %j", async location => {
    mocks.location.mockResolvedValue(location);
    expect(await clock("in")).toEqual({ success: false, error: "Business location not set. Contact owner." }); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("denies corrupt stored geographic coordinates with existing location validator", async () => {
    mocks.location.mockResolvedValue({ latitude: 91, longitude: 121 });
    expect(await clock("in")).toEqual({ success: false, error: "Invalid location coordinates." }); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("denies any existing same-PH-day record before create", async () => {
    mocks.txRead.mockResolvedValue(row);
    expect(await clock("in")).toEqual({ success: false, error: "Already clocked in today." }); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("safely rejects a unique race without postcommit side effects", async () => {
    mocks.create.mockRejectedValue({ code: "P2002", message: "private SQL" });
    expect(await clock("in")).toEqual({ success: false, error: "Already clocked in today." }); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.conflicts).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("conditionally closes only the current tenant/self row with null clock-out", async () => {
    const updated = { ...row, time_out: now }; mocks.txOpen.mockResolvedValue([row]); mocks.txRead.mockResolvedValue(updated);
    expect(await clock("out")).toEqual({ success: true, data: updated });
    expect(mocks.update).toHaveBeenCalledWith({ where: { employee_id: 7, employee: target, date: row.date, id: 8, time_in: row.time_in, time_out: null, paid_in_payslip_id: null, revision: 0 }, data: { time_out: expect.any(Date), payroll_confirmed_at: null, payroll_confirmed_by: null, revision: { increment: 1 } } });
    expect(mocks.cache).toHaveBeenCalledWith("/[businessSlug]", "page"); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([null, { ...row, time_out: now }])("denies missing/already closed attendance %j", async attendance => {
    mocks.txOpen.mockResolvedValue(attendance ? [attendance] : []);
    expect(await clock("out")).toMatchObject({ success: false }); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it.each([0, 2])("rolls back conditional clock-out count%s without success effects", async count => {
    mocks.txOpen.mockResolvedValue([row]); mocks.update.mockResolvedValue({ count });
    expect(await clock("out")).toEqual({ success: false, error: "Already clocked out." }); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.conflicts).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("rolls back an unreadable post-update row rather than reporting committed success", async () => {
    mocks.txOpen.mockResolvedValue([row]); mocks.txRead.mockResolvedValue(null);
    expect(await clock("out")).toMatchObject({ success: false }); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it.each(["in", "out"] as const)("returns safe rollback errors on clock-%s write failure", async direction => {
    mocks.txOpen.mockResolvedValue(direction === "out" ? [row] : []);
    mocks.create.mockRejectedValue(new Error("private fixture SQL")); mocks.update.mockRejectedValue(new Error("private fixture SQL"));
    expect(await clock(direction)).toEqual({ success: false, error: `Failed to clock ${direction}` }); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it.each(["in", "out"] as const)("safely rejects a serializable clock-%s conflict without retry", async direction => {
    mocks.transaction.mockRejectedValue({ code: "P2034", message: "private fixture SQL" });
    expect(await clock(direction)).toEqual({ success: false, error: `Failed to clock ${direction}` }); expect(mocks.transaction).toHaveBeenCalledOnce(); expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it.each(["in", "out"] as const)("preserves committed clock-%s when provider and cache both fail", async direction => {
    if (direction === "out") { mocks.txOpen.mockResolvedValue([row]); mocks.txRead.mockResolvedValue({ ...row, time_out: now }); }
    mocks.conflicts.mockRejectedValue(new Error("fixture provider unavailable")); mocks.cache.mockImplementation(() => { throw new Error("fixture cache unavailable"); });
    expect(await clock(direction)).toMatchObject({ success: true }); expect(mocks.warning).toHaveBeenCalledTimes(2); expect(mocks.rollback).not.toHaveBeenCalled();
  });
  it.each(["in", "out"] as const)("preserves committed clock-%s when optional warning logging also throws", async direction => {
    if (direction === "out") { mocks.txOpen.mockResolvedValue([row]); mocks.txRead.mockResolvedValue({ ...row, time_out: now }); }
    mocks.conflicts.mockRejectedValue(new Error("fixture provider unavailable")); mocks.cache.mockImplementation(() => { throw new Error("fixture cache unavailable"); });
    mocks.warning.mockImplementation(() => { throw new Error("fixture logger unavailable"); });
    expect(await clock(direction)).toMatchObject({ success: true }); expect(mocks.rollback).not.toHaveBeenCalled();
  });
  it("service also rejects inconsistent trusted/legacy tenant before persistence", async () => {
    expect(await clockInSelfServiceAttendance({ businessSlug: "tenant", userId: "staff" }, { employeeId: 7, latitude: 14.5, longitude: 121, businessSlug: "foreign" })).toEqual({ success: false, error: "Unauthorized business context" });
    expect(mocks.business).not.toHaveBeenCalled();
  });
});


describe("overnight clocks and payroll work evidence", () => {
  const overnight = { ...row, date: new Date("2030-01-14T16:00:00Z"), time_in: new Date("2030-01-15T15:00:00Z") };
  it("closes yesterday's open shift after Philippine midnight and keeps its original work date", async () => {
    mocks.txOpen.mockResolvedValue([overnight]); mocks.txRead.mockResolvedValue({ ...overnight, time_out: now });
    expect(await clock("out")).toMatchObject({ success: true, data: { date: overnight.date, time_out: now } });
    expect(mocks.update.mock.calls[0][0].where).toMatchObject({ date: overnight.date, time_in: overnight.time_in, paid_in_payslip_id: null, revision: 0 });
    expect(mocks.conflicts).toHaveBeenCalledWith({ businessSlug: "tenant", changedDate: overnight.date, trigger: "ATTENDANCE_UPDATED" });
  });
  it.each([new Date(now.getTime() - 25 * 3600000), new Date(now.getTime() + 60000)])("requires owner review for stale or future open time %s", async started => {
    mocks.txOpen.mockResolvedValue([{ ...overnight, time_in: started }]);
    expect(await clock("out")).toMatchObject({ success: false, error: expect.stringContaining("owner review") });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("blocks another clock-in while any prior shift remains open", async () => {
    mocks.txOpen.mockResolvedValue([overnight]);
    expect(await clock("in")).toMatchObject({ success: false, error: expect.stringContaining("still open") });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("blocks ambiguous open shifts rather than choosing a record silently", async () => {
    mocks.txOpen.mockResolvedValue([overnight, { ...overnight, id: 9 }]);
    expect(await clock("out")).toMatchObject({ success: false, error: expect.stringContaining("Conflicting") });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["legacy-paid", "published"])("preserves clocks already included in %s evidence", async kind => {
    mocks.txOpen.mockResolvedValue([{ ...overnight, paid_in_payslip_id: kind === "legacy-paid" ? 1 : null }]);
    if (kind === "published") mocks.published.mockResolvedValue({ id: "earning-published" });
    expect(await clock("out")).toMatchObject({ success: false, error: expect.stringContaining("Published attendance") });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["ACTIVE", "SHADOW"])("records an unconfirmed actual open session for %s without creating salary", async mode => {
    mocks.settings.mockResolvedValue({ mode });
    expect(await clock("in")).toMatchObject({ success: true });
    expect(mocks.sessionCreate).toHaveBeenCalledWith({ data: { business_id: "biz", employee_id: 7, work_date: new Date("2030-01-16T00:00:00Z"), started_at: now, ended_at: null, confirmed_at: null, confirmed_by: null, breaks: [] } });
  });
  it("atomically closes the matching unconfirmed session with its expected revision", async () => {
    mocks.settings.mockResolvedValue({ mode: "ACTIVE" }); mocks.txOpen.mockResolvedValue([overnight]); mocks.txRead.mockResolvedValue({ ...overnight, time_out: now });
    mocks.sessions.mockResolvedValue([{ id: "session-a", started_at: overnight.time_in, ended_at: null, confirmed_at: null, revision: 2 }]);
    expect(await clock("out")).toMatchObject({ success: true });
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({ where: { id: "session-a", business_id: "biz", employee_id: 7, revision: 2, ended_at: null, confirmed_at: null }, data: { ended_at: now, revision: { increment: 1 } } });
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });
  it("rolls back attendance if the session changed concurrently", async () => {
    mocks.settings.mockResolvedValue({ mode: "ACTIVE" }); mocks.txOpen.mockResolvedValue([overnight]);
    mocks.sessions.mockResolvedValue([{ id: "session-a", started_at: overnight.time_in, ended_at: null, confirmed_at: null, revision: 2 }]); mocks.sessionUpdate.mockResolvedValue({ count: 0 });
    expect(await clock("out")).toMatchObject({ success: false });
    expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.conflicts).not.toHaveBeenCalled();
  });
  it("does not overwrite an owner-confirmed work session", async () => {
    mocks.settings.mockResolvedValue({ mode: "ACTIVE" }); mocks.txOpen.mockResolvedValue([overnight]);
    mocks.sessions.mockResolvedValue([{ id: "session-a", started_at: overnight.time_in, ended_at: null, confirmed_at: now, revision: 2 }]);
    expect(await clock("out")).toMatchObject({ success: false, error: expect.stringContaining("owner review") });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("exposes an open overnight attendance record in the current-day status for clock-out", async () => {
    mocks.read.mockResolvedValue(null); mocks.monthly.mockResolvedValue([overnight]);
    expect(await checkAttendanceStatusAction(7, now)).toEqual({ success: true, data: overnight });
    expect(mocks.monthly).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ time_out: null, employee_id: 7, time_in: { gte: new Date(now.getTime() - 24 * 3600000), lte: now } }), take: 2 }));
  });
});
