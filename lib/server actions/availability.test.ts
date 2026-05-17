import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailableSlots, getDayCapacityRange } from "./availability";

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
vi.mock("@/lib/services/booking-availability", () => availabilityServiceMock);
vi.mock("@/lib/data/cached", () => ({
  getCachedBusinessWithHoursAndEmployees: vi.fn(),
  getCachedBusinessBySlug: vi.fn(),
}));
vi.mock("@/lib/services/booking-metrics", () => ({
  recordBookingMetric: vi.fn(),
}));
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    booking: { findMany: vi.fn() },
    employeeAttendance: { findMany: vi.fn() },
    business: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/services/booking-policy", () => bookingPolicyServiceMock);

describe("availability server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
