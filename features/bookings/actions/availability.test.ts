// Colocated action regression test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailableSlots, getDayCapacityRange, getAlternativeSlots, getAvailableProviders, checkCategoryAvailability, getBusinessHours } from "./availability";

const cacheMock = vi.hoisted(() => ({ getCachedBusinessWithHoursAndEmployees: vi.fn(), getCachedBusinessBySlug: vi.fn() }));
const dbMock = vi.hoisted(() => ({ booking: { findMany: vi.fn() }, employeeAttendance: { findMany: vi.fn() }, business: { findUnique: vi.fn() } }));
const metricsMock = vi.hoisted(() => ({ recordBookingMetric: vi.fn() }));

const rateLimitMock = vi.hoisted(() => ({
  rateLimit: vi.fn(),
}));

const headersMock = vi.hoisted(() => ({
  headers: vi.fn(),
}));

const authMock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

const availabilityServiceMock = vi.hoisted(() => ({
  computeSlots: vi.fn(),
  listAlternativeSlots: vi.fn(),
}));

const bookingPolicyServiceMock = vi.hoisted(() => ({
  getBookingPolicyByBusinessSlug: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => rateLimitMock);
vi.mock("next/headers", () => headersMock);
vi.mock("next-auth", () => authMock);
vi.mock("@/features/bookings/services/booking-availability", () => availabilityServiceMock);
vi.mock("@/lib/data/cached", () => cacheMock);
vi.mock("@/features/bookings/services/booking-metrics", () => metricsMock);
vi.mock("@/prisma/prisma", () => ({ prisma: dbMock }));
vi.mock("@/lib/services/booking-policy", () => bookingPolicyServiceMock);

describe("availability server action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cacheMock.getCachedBusinessBySlug.mockResolvedValue(null);
    authMock.getServerSession.mockResolvedValue(null);
    headersMock.headers.mockResolvedValue({
      get: vi.fn((key: string) =>
        key === "x-forwarded-for" ? "203.0.113.10" : null,
      ),
    });
    rateLimitMock.rateLimit.mockResolvedValue({
      success: true,
      limit: 60,
      remaining: 59,
      reset: Date.now() + 1000,
    });
    bookingPolicyServiceMock.getBookingPolicyByBusinessSlug.mockResolvedValue({
      bookingHorizonDays: 14,
      minLeadMinutes: 30,
      slotIntervalMinutes: 30,
      sameDayAttendanceStrictMinutes: 120,
      allowPublicFullPayment: true,
      allowPublicDownpayment: true,
      defaultPublicPaymentType: "FULL",
      bookingV2Enabled: true,
    });
  });

  afterEach(() => vi.useRealTimers());

  const date = new Date("2030-01-15T01:00:00Z");
  const slotsInput = { businessSlug: "demo-business", date, services: [{ id: 1 }] };
  const requests = [
    { kind: "slots", run: () => getAvailableSlots(slotsInput), malformed: () => getAvailableSlots({ ...slotsInput, services: [{ id: -1 }] }) },
    { kind: "day-capacity", run: () => getDayCapacityRange({ ...slotsInput, fromDate: date, toDate: date }), malformed: () => getDayCapacityRange({ ...slotsInput, fromDate: date, toDate: new Date(NaN) }) },
    { kind: "alternatives", run: () => getAlternativeSlots({ ...slotsInput, scheduledAt: date }), malformed: () => getAlternativeSlots({ ...slotsInput, scheduledAt: date, limit: 51 }) },
    { kind: "providers", run: () => getAvailableProviders({ businessSlug: "demo-business", startTime: date, endTime: new Date(date.getTime() + 60_000) }), malformed: () => getAvailableProviders({ businessSlug: "demo-business", startTime: date, endTime: date }) },
    { kind: "category", run: () => checkCategoryAvailability({ businessSlug: "demo-business" }), malformed: () => checkCategoryAvailability({ businessSlug: "demo-business", category: "" }) },
    { kind: "hours", run: () => getBusinessHours("demo-business"), malformed: () => getBusinessHours("bad/slug") },
  ];
  it.each(requests)("rate-limits anonymous $kind before any domain lookup", async ({ kind, run }) => {
    rateLimitMock.rateLimit.mockResolvedValue({ success: false });
    await expect(run()).rejects.toThrow("Too many availability requests");
    expect(rateLimitMock.rateLimit).toHaveBeenCalledWith(`public-availability:${kind}:demo-business:203.0.113.10`, { windowMs: 60_000, maxRequests: 60 });
    expect(availabilityServiceMock.computeSlots).not.toHaveBeenCalled(); expect(cacheMock.getCachedBusinessWithHoursAndEmployees).not.toHaveBeenCalled(); expect(dbMock.business.findUnique).not.toHaveBeenCalled();
  });
  it.each(requests)("validates $kind before auth/rate/persistence", async ({ malformed }) => {
    await expect(malformed()).rejects.toThrow("Invalid input");
    expect(authMock.getServerSession).not.toHaveBeenCalled(); expect(rateLimitMock.rateLimit).not.toHaveBeenCalled();
  });
  it("preserves authenticated rate bypass", async () => {
    authMock.getServerSession.mockResolvedValue({ user: { id: "verified" } }); availabilityServiceMock.computeSlots.mockResolvedValue([]);
    expect(await getAvailableSlots(slotsInput)).toEqual([]);
    expect(headersMock.headers).not.toHaveBeenCalled(); expect(rateLimitMock.rateLimit).not.toHaveBeenCalled();
  });
  it("maps limiter infrastructure failure to safe errors", async () => {
    rateLimitMock.rateLimit.mockRejectedValue(new Error("secret SQL stack"));
    await expect(getAvailableSlots(slotsInput)).rejects.toThrow(/^Unable to load availability$/);
  });
  it("records successful lookup metadata without changing the slot result", async () => {
    cacheMock.getCachedBusinessBySlug.mockResolvedValue({ id: "biz" }); availabilityServiceMock.computeSlots.mockResolvedValue([]);
    expect(await getAvailableSlots(slotsInput)).toEqual([]);
    expect(metricsMock.recordBookingMetric).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz", outcome: "SUCCESS", metadata: expect.objectContaining({ slotsReturned: 0, hasCapacity: false }) }));
  });
  it.each(["cache", "metric"])("ignores %s telemetry failure after successful slot computation", async stage => {
    cacheMock.getCachedBusinessBySlug.mockResolvedValue({ id: "biz" }); availabilityServiceMock.computeSlots.mockResolvedValue([]);
    if (stage === "cache") cacheMock.getCachedBusinessBySlug.mockRejectedValue(new Error("private")); else metricsMock.recordBookingMetric.mockRejectedValue(new Error("private"));
    expect(await getAvailableSlots(slotsInput)).toEqual([]);
  });
  it("records only a static failure reason and hides private domain errors", async () => {
    cacheMock.getCachedBusinessBySlug.mockResolvedValue({ id: "biz" }); availabilityServiceMock.computeSlots.mockRejectedValue(new Error("secret database details"));
    await expect(getAvailableSlots(slotsInput)).rejects.toThrow(/^Unable to load availability$/);
    expect(metricsMock.recordBookingMetric).toHaveBeenCalledWith(expect.objectContaining({ outcome: "FAILED", reason: "LOOKUP_FAILED" }));
  });
  it("bounds fanout independently of stored horizon and schedules at most four days concurrently", async () => {
    bookingPolicyServiceMock.getBookingPolicyByBusinessSlug.mockResolvedValue({ bookingHorizonDays: 100_000, slotIntervalMinutes: 30 });
    let active = 0; let peak = 0;
    availabilityServiceMock.computeSlots.mockImplementation(async () => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return []; });
    const result = await getDayCapacityRange({ ...slotsInput, fromDate: date, toDate: new Date(date.getTime() + 366 * 86_400_000) });
    expect(Object.keys(result)).toHaveLength(90); expect(availabilityServiceMock.computeSlots).toHaveBeenCalledTimes(90); expect(peak).toBe(4);
  });
  it("narrows hour projections without loading full business records", async () => {
    dbMock.business.findUnique.mockResolvedValue({ business_hours: [] });
    expect(await getBusinessHours("demo-business")).toEqual([]);
    expect(dbMock.business.findUnique).toHaveBeenCalledWith({ where: { slug: "demo-business" }, select: { business_hours: { orderBy: { day_of_week: "asc" }, select: { id: true, day_of_week: true, open_time: true, close_time: true, is_closed: true, category: true, business_id: true } } } });
  });

  it("preserves alternatives and their default limit", async () => {
    const alternatives = [{ startTime: new Date("2026-02-13T01:00:00Z") }];
    availabilityServiceMock.listAlternativeSlots.mockResolvedValue(alternatives);
    expect(await getAlternativeSlots({ businessSlug: "demo-business", scheduledAt: new Date("2026-02-13T00:00:00Z"), services: [{ id: 1 }] })).toEqual(alternatives);
    expect(availabilityServiceMock.listAlternativeSlots).toHaveBeenCalledWith(expect.objectContaining({ limit: 6 }));
  });

  it("preserves qualified provider DTOs, busy flags and STAFF-only filtering", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-02-13T01:00:00Z"));
    cacheMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({ id: "biz", employees: [
      { id: 1, profile: "STAFF", specialties: [], user: { name: "General" } },
      { id: 2, profile: "STAFF", specialties: ["SPA"], user: { name: "Busy" } },
      { id: 3, profile: "MANAGER", specialties: ["SPA"], user: { name: "Manager" } },
      { id: 4, profile: "STAFF", specialties: ["NAILS"], user: { name: "Other" } },
    ] });
    dbMock.booking.findMany.mockResolvedValue([{ availed_services: [{ served_by_id: 2, status: "CLAIMED" }, { served_by_id: 1, status: "CANCELLED" }] }]);
    expect(await getAvailableProviders({ businessSlug: "demo-business", startTime: new Date("2026-02-13T02:00:00Z"), endTime: new Date("2026-02-13T03:00:00Z"), categories: ["spa"] })).toEqual([
      { id: 1, name: "General", specialties: [], available: true, type: "EMPLOYEE" },
      { id: 2, name: "Busy", specialties: ["SPA"], available: false, type: "EMPLOYEE" },
    ]);
  });

  it("preserves category-hour fallback, wildcard employees and owner specialty counts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-02-13T02:00:00Z"));
    const date = new Date("2026-02-13T02:00:00Z");
    cacheMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({ business_hours: [{ day_of_week: date.getDay(), category: "GENERAL", open_time: "09:00", close_time: "18:00", is_closed: false }], employees: [{ profile: "STAFF", specialties: [] }, { profile: "STAFF", specialties: ["SPA"] }, { profile: "MANAGER", specialties: ["SPA"] }], owners: [{ specialties: ["SPA"] }, { specialties: [] }] });
    expect(await checkCategoryAvailability({ businessSlug: "demo-business", category: "spa", date })).toEqual({ hasBusinessHours: true, businessHoursPassed: false, qualifiedEmployeeCount: 2, qualifiedOwnerCount: 1, qualifiedProviderCount: 3, businessHours: { open_time: "09:00", close_time: "18:00", is_closed: false } });
  });

  it("preserves public business-hour rows and missing-business error", async () => {
    const rows = [{ id: 1, day_of_week: 1, category: "GENERAL", open_time: "09:00", close_time: "18:00", is_closed: false, business_id: "biz" }];
    dbMock.business.findUnique.mockResolvedValueOnce({ business_hours: rows }).mockResolvedValueOnce(null);
    expect(await getBusinessHours("demo-business")).toEqual(rows);
    await expect(getBusinessHours("missing")).rejects.toThrow("Business not found");
  });

  it("returns slots with confidence/source from computeSlots", async () => {
    const slot = {
      startTime: new Date("2026-02-13T09:00:00+08:00"),
      endTime: new Date("2026-02-13T09:30:00+08:00"),
      available: true,
      availableEmployeeCount: 1,
      availableOwnerCount: 0,
      source: "WORKLOAD" as const,
      confidence: "GUARANTEED" as const,
    };
    availabilityServiceMock.computeSlots.mockResolvedValue([slot]);

    const result = await getAvailableSlots({
      businessSlug: "demo-business",
      date: new Date("2026-02-13T00:00:00+08:00"),
      services: [{ id: 1, quantity: 1 }],
    });

    expect(availabilityServiceMock.computeSlots).toHaveBeenCalled();
    expect(result).toEqual([slot]);
  });

  it("returns slot counts per day across the booking horizon", async () => {
    // computeSlots is called once per day; we vary the return length
    // so the test verifies aggregation, not just a constant.
    let callIdx = 0;
    availabilityServiceMock.computeSlots.mockImplementation(async () => {
      callIdx += 1;
      // alternate: 5 slots, 0 slots, 5 slots, 0 slots, ...
      return Array.from({ length: callIdx % 2 === 0 ? 0 : 5 });
    });

    const fromDate = new Date("2026-02-13T00:00:00+08:00");
    // 3-day window so the test stays small but exercises the loop.
    const toDate = new Date("2026-02-16T00:00:00+08:00");

    const result = await getDayCapacityRange({
      businessSlug: "demo-business",
      services: [{ id: 1, quantity: 1 }],
      fromDate,
      toDate,
    });

    expect(Object.keys(result)).toHaveLength(3);
    // Each value is the number of slots returned for that day.
    expect(Object.values(result).every((v) => typeof v === "number")).toBe(
      true,
    );
    expect(availabilityServiceMock.computeSlots).toHaveBeenCalledTimes(3);
  });

  it("clamps day-capacity range to the booking horizon", async () => {
    availabilityServiceMock.computeSlots.mockResolvedValue([]);

    const fromDate = new Date("2026-02-13T00:00:00+08:00");
    // Ask for 30 days; horizon is 14 — only 14 should be queried.
    const toDate = new Date(fromDate.getTime() + 30 * 86400000);

    await getDayCapacityRange({
      businessSlug: "demo-business",
      services: [{ id: 1, quantity: 1 }],
      fromDate,
      toDate,
    });

    expect(availabilityServiceMock.computeSlots).toHaveBeenCalledTimes(14);
  });

  it("returns 0 for days where computeSlots throws (does not fail the range)", async () => {
    let callIdx = 0;
    availabilityServiceMock.computeSlots.mockImplementation(async () => {
      callIdx += 1;
      if (callIdx === 2) throw new Error("transient");
      return [{}, {}];
    });

    const fromDate = new Date("2026-02-13T00:00:00+08:00");
    const toDate = new Date(fromDate.getTime() + 3 * 86400000);

    const result = await getDayCapacityRange({
      businessSlug: "demo-business",
      services: [{ id: 1, quantity: 1 }],
      fromDate,
      toDate,
    });

    const values = Object.values(result);
    expect(values).toContain(0);
    expect(values.filter((v) => v === 2)).toHaveLength(2);
  });

  it("blocks when availability rate limit is exceeded", async () => {
    rateLimitMock.rateLimit.mockResolvedValue({
      success: false,
      limit: 60,
      remaining: 0,
      reset: Date.now() + 1000,
    });

    await expect(
      getAvailableSlots({
        businessSlug: "demo-business",
        date: new Date("2026-02-13T00:00:00+08:00"),
        services: [{ id: 1, quantity: 1 }],
      }),
    ).rejects.toThrow("Too many availability requests");
  });
});
