import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEmployeeScheduleAction, resetEmployeePasswordAction, resendEmployeeInviteAction, upsertEmployeeScheduleAction } from "@/features/workforce/actions/employees";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), business: vi.fn(), employee: vi.fn(), user: vi.fn(), accountWrite: vi.fn(), employeeWrite: vi.fn(), schedules: vi.fn(), removeSchedules: vi.fn(), addSchedules: vi.fn(), hash: vi.fn(), sms: vi.fn(), cache: vi.fn(), transaction: vi.fn(), conflictRead: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", async original => ({ ...await original<typeof import("@/lib/auth/staff-access")>(), resolveTenantActorContext: mocks.actor }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/lib/services/employee-invite", () => ({ sendEmployeeInviteSms: mocks.sms }));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/prisma/prisma", () => ({ prisma: { business: { findUnique: mocks.business }, employee: { findFirst: mocks.employee, updateMany: mocks.employeeWrite }, user: { findUnique: mocks.user, update: mocks.accountWrite, updateMany: mocks.accountWrite }, employeeSchedule: { findMany: mocks.schedules, deleteMany: mocks.removeSchedules, createMany: mocks.addSchedules }, $transaction: mocks.transaction } }));
import { prisma } from "@/prisma/prisma";
const now = new Date("2030-01-15T09:00:00Z"); const date = new Date("2030-01-01T00:00:00Z");
const account = { id: "staff", name: "Staff", contact_number: "639171234567", role: "EMPLOYEE", created_at: date, updated_at: date, hashed_password: "fixture-old-hash", must_change_password: true, temp_password_expires_at: date };
const employee = { id: 7, user_id: "staff", business_id: "biz", user: account, business: { name: "Tenant" }, profile: "STAFF", permissions: [], specialties: [], recurring_days_off: [], daily_rate: 0, commission_percentage: 0 };
const rows = [{ day_of_week: 1, start_time: "09:00", end_time: "12:00" }, { day_of_week: 1, start_time: "13:00", end_time: "17:00" }];
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "owner", role: "OWNER" } } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", role: "OWNER", ownerId: 1, userId: "owner", businessId: "biz", businessSlug: "tenant" });
  mocks.business.mockResolvedValue({ id: "biz", name: "Tenant" }); mocks.employee.mockResolvedValue(employee); mocks.schedules.mockResolvedValue(rows);
  mocks.hash.mockResolvedValue("fixture-new-hash"); mocks.sms.mockResolvedValue({ success: true }); mocks.accountWrite.mockResolvedValue({ count: 1 }); mocks.employeeWrite.mockResolvedValue({ count: 1 }); mocks.removeSchedules.mockResolvedValue({ count: 2 }); mocks.addSchedules.mockImplementation(async ({ data }) => ({ count: data.length }));
  mocks.transaction.mockImplementation(async work => work(prisma));
});
afterEach(() => vi.useRealTimers());
describe("employee administration legacy contracts", () => {
  it("owner reset installs a known permanent password with expiry flags cleared", async () => {
    expect(await resetEmployeePasswordAction(7, "fixture-known-password")).toEqual({ success: true });
    expect(mocks.hash).toHaveBeenCalledWith("fixture-known-password", 12);
    expect(mocks.accountWrite).toHaveBeenCalledWith(expect.objectContaining({ data: { hashed_password: "fixture-new-hash", must_change_password: false, temp_password_expires_at: null } }));
    expect(mocks.sms).not.toHaveBeenCalled();
  });
  it.each([true, false])("resend retains authorized one-time plaintext fallback with SMS success%s", async success => {
    mocks.sms.mockResolvedValue({ success, error: "fixture provider unavailable" });
    const result = await resendEmployeeInviteAction(7);
    expect(result).toMatchObject({ success: true, tempPassword: expect.stringMatching(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/) });
    if (!("tempPassword" in result)) throw new Error("Expected one-time password");
    if (!success) expect(result).toHaveProperty("warning", "Password rotated but SMS failed. Share manually: " + result.tempPassword);
    expect(mocks.accountWrite).toHaveBeenCalledWith(expect.objectContaining({ data: { hashed_password: "fixture-new-hash", must_change_password: true, temp_password_expires_at: new Date(now.getTime() + 3 * 86400000) } }));
    expect(mocks.sms).toHaveBeenCalledWith(expect.objectContaining({ tempPassword: result.tempPassword, to: "639171234567" }));
    expect(JSON.stringify(result)).not.toContain("hashed_password");
  });
  it("keeps tenant-member schedule view, not a new self-only policy", async () => {
    mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "other-staff", role: "EMPLOYEE" } } });
    mocks.actor.mockResolvedValue({ success: true, actorType: "EMPLOYEE", role: "EMPLOYEE", employeeId: 9, userId: "other-staff", businessId: "biz", businessSlug: "tenant" });
    expect(await getEmployeeScheduleAction(7)).toEqual({ success: true, data: rows });
  });
  it("keeps multiple same-day ranges and atomic replace-all", async () => {
    expect(await upsertEmployeeScheduleAction(7, rows)).toEqual({ success: true }); expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.addSchedules).toHaveBeenCalledWith({ data: rows.map(row => ({ ...row, employee_id: 7 })) });
  });
  it("keeps empty replace-all clearing schedules", async () => {
    expect(await upsertEmployeeScheduleAction(7, [])).toEqual({ success: true }); expect(mocks.removeSchedules).toHaveBeenCalledOnce(); expect(mocks.addSchedules).not.toHaveBeenCalled();
  });
  it("rejects same-day daytime overlap without mutating", async () => {
    expect(await upsertEmployeeScheduleAction(7, [...rows, { day_of_week: 1, start_time: "11:00", end_time: "14:00" }])).toEqual({ success: false, error: "Time ranges overlap on the same day." });
    expect(mocks.removeSchedules).not.toHaveBeenCalled();
  });
  it("preserves overnight shift exclusion from daytime overlap checks", async () => {
    expect(await upsertEmployeeScheduleAction(7, [...rows, { day_of_week: 1, start_time: "22:00", end_time: "06:00" }])).toEqual({ success: true });
  });
});
