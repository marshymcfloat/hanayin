import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAttendanceCountAction } from "./attendance";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), employee: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/lib/services/booking-conflicts", () => ({ detectAndEmitFutureBookingConflicts: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { employee: { findFirst: mocks.employee }, employeeAttendance: { count: mocks.count } } }));

const start = new Date("2026-09-01");
const end = new Date("2026-09-16");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "tenant", session: { user: { id: "staff" } } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "EMPLOYEE", employeeId: 7, businessId: "biz" });
  mocks.employee.mockResolvedValue({ id: 7 });
  mocks.count.mockResolvedValue(5);
});

describe("attendance count access", () => {
  it("denies unauthenticated reads before protected persistence", async () => {
    mocks.auth.mockResolvedValue({ success: false });
    expect(await getAttendanceCountAction(7, start, end)).toMatchObject({ success: false });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("denies another employee's count", async () => {
    expect(await getAttendanceCountAction(8, start, end)).toMatchObject({ success: false, error: "Unauthorized" });
    expect(mocks.employee).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("denies missing current tenant membership", async () => {
    mocks.actor.mockResolvedValue({ success: false });
    expect(await getAttendanceCountAction(7, start, end)).toMatchObject({ success: false });
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("denies foreign employees for owners before counting", async () => {
    mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", businessId: "biz" });
    mocks.employee.mockResolvedValue(null);
    expect(await getAttendanceCountAction(99, start, end)).toMatchObject({ success: false });
    expect(mocks.employee).toHaveBeenCalledWith({ where: { id: 99, business_id: "biz" }, select: { id: true } });
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it.each(["EMPLOYEE", "OWNER"])("allows %s with explicit tenant count and original range semantics", async (actorType) => {
    mocks.actor.mockResolvedValue({ success: true, actorType, employeeId: 7, businessId: "biz" });
    expect(await getAttendanceCountAction(7, start, end)).toEqual({ success: true, data: 5 });
    expect(mocks.actor).toHaveBeenCalledWith("tenant", "staff");
    expect(mocks.count).toHaveBeenCalledWith({ where: { employee_id: 7, employee: { business_id: "biz" }, status: "PRESENT", date: { gt: start, lte: end } } });
  });

  it.each([[0, start, end], [1.5, start, end], [7, new Date(Number.NaN), end], [7, end, start]])("rejects malformed query before membership/read", async (id, from, to) => {
    expect(await getAttendanceCountAction(id as number, from as Date, to as Date)).toMatchObject({ success: false, error: "Invalid attendance query" });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("returns safe query failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.count.mockRejectedValue(new Error("private test failure"));
    expect(await getAttendanceCountAction(7, start, end)).toEqual({ success: false, error: "Failed to fetch attendance count" });
    vi.restoreAllMocks();
  });
});
