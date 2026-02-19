import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailableSlots } from "./availability";

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
