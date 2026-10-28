import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAttendanceStatusAction, clockInAction, clockOutAction, getMonthlyAttendanceAction } from "@/features/workforce/actions/attendance";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), employee: vi.fn(), business: vi.fn(), attendance: vi.fn(), monthly: vi.fn(), open: vi.fn(), settings: vi.fn(), published: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), transaction: vi.fn(), conflicts: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: mocks.conflicts }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/prisma/prisma", () => ({ prisma: {
  employee: { findUnique: mocks.employee, findFirst: mocks.employee }, business: { findUnique: mocks.business, findFirst: mocks.business },
  payrollSettings: { findUnique: mocks.settings }, payrollEarning: { findFirst: mocks.published }, employeeAttendance: { findFirst: mocks.attendance, findMany: (input: { where: { time_out?: null } }) => input.where.time_out === null ? mocks.open(input) : mocks.monthly(input), create: mocks.create, update: mocks.update, updateMany: mocks.updateMany }, $transaction: mocks.transaction,
} }));
import { prisma } from "@/prisma/prisma";

const now = new Date("2030-01-15T16:30:00Z");
const row = { id: 8, employee_id: 7, date: new Date("2030-01-15T16:00:00Z"), time_in: now, time_out: null, status: "PRESENT" };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "staff", role: "EMPLOYEE" } } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "EMPLOYEE", employeeId: 7, ownerId: null, role: "EMPLOYEE", businessId: "biz", businessSlug: "tenant", userId: "staff" });
  mocks.employee.mockResolvedValue({ id: 7, business_id: "biz", business: { slug: "tenant" } });
  mocks.business.mockResolvedValue({ id: "biz", slug: "tenant", latitude: 14.5, longitude: 121 });
  mocks.attendance.mockResolvedValue(null); mocks.monthly.mockResolvedValue([row]); mocks.create.mockResolvedValue(row);
  mocks.open.mockResolvedValue([]); mocks.settings.mockResolvedValue(null); mocks.published.mockResolvedValue(null);
  mocks.update.mockResolvedValue({ ...row, time_out: now }); mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async work => work(prisma));
});
afterEach(() => vi.useRealTimers());

describe("attendance legacy behavior characterization", () => {
  it("reads an owner's tenant employee on the Philippine calendar day", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "owner", role: "OWNER" } } });
    mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", employeeId: null, ownerId: 1, role: "OWNER", businessId: "biz", businessSlug: "tenant", userId: "owner" });
    mocks.attendance.mockResolvedValue(row);
    expect(await checkAttendanceStatusAction(7, now)).toEqual({ success: true, data: row });
    expect(mocks.attendance).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employee_id: 7, date: { gte: new Date("2030-01-15T16:00:00Z"), lte: new Date("2030-01-16T15:59:59.999Z") } }) }));
  });
  it("denies an employee reading a colleague before attendance persistence", async () => {
    expect(await checkAttendanceStatusAction(9, now)).toMatchObject({ success: false });
    expect(mocks.attendance).not.toHaveBeenCalled();
  });
  it("preserves zero-based Philippine month boundaries and result shape", async () => {
    expect(await getMonthlyAttendanceAction(7, 2030, 0)).toEqual({ success: true, data: [row] });
    expect(mocks.monthly).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employee_id: 7, date: { gte: new Date("2029-12-31T16:00:00Z"), lte: new Date("2030-01-31T15:59:59.999Z") } }) }));
  });
  it("gates clock-in writes, creates verified self attendance and reports conflicts", async () => {
    expect(await clockInAction(7, 14.5, 121, "tenant")).toEqual({ success: true, data: row });
    expect(mocks.auth).toHaveBeenCalledWith({ write: true });
    expect(mocks.create).toHaveBeenCalledWith({ data: { employee_id: 7, date: row.date, time_in: now, status: "PRESENT", location_verified: true, latitude: 14.5, longitude: 121 } });
    expect(mocks.conflicts).toHaveBeenCalledWith({ businessSlug: "tenant", changedDate: row.date, trigger: "ATTENDANCE_UPDATED" });
    expect(mocks.cache).toHaveBeenCalledWith("/tenant");
  });
  it("denies a mismatched legacy business slug before attendance writes", async () => {
    expect(await clockInAction(7, 14.5, 121, "foreign")).toMatchObject({ success: false, error: "Unauthorized business context" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves clock-out result and conflict notification day", async () => {
    mocks.open.mockResolvedValue([row]); mocks.attendance.mockResolvedValue({ ...row, time_out: now });
    expect(await clockOutAction(7, 14.5, 121, "tenant")).toEqual({ success: true, data: { ...row, time_out: now } });
    expect(mocks.auth).toHaveBeenCalledWith({ write: true });
    expect(mocks.conflicts).toHaveBeenCalledWith({ businessSlug: "tenant", changedDate: row.date, trigger: "ATTENDANCE_UPDATED" });
  });
});
