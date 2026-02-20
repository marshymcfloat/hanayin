import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeSlots,
  validateBookingOrThrow,
} from "./booking-availability";
import { StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";

const prismaMock = vi.hoisted(() => ({
  service: { findMany: vi.fn() },
  booking: { findMany: vi.fn() },
}));

const cachedMock = vi.hoisted(() => ({
  getCachedBusinessWithHoursAndEmployees: vi.fn(),
}));

const policyMock = vi.hoisted(() => ({
  getBookingPolicyByBusinessSlug: vi.fn(),
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/data/cached", () => cachedMock);
vi.mock("./booking-policy", () => policyMock);
vi.mock("@/lib/date-utils", () => ({
  getCurrentDateTimePH: vi.fn(() => new Date("2026-02-12T08:00:00+08:00")),
}));

const baseBusiness = {
  id: "biz_1",
  manager_can_serve: true,
  business_hours: [
    {
      day_of_week: 4,
      category: "GENERAL",
      open_time: "09:00",
      close_time: "18:00",
      is_closed: false,
    },
    {
      day_of_week: 5,
      category: "GENERAL",
      open_time: "09:00",
      close_time: "18:00",
      is_closed: false,
    },
  ],
  employees: [
    {
      id: 1,
      profile: StaffProfile.STAFF,
      permissions: [StaffPermission.QUEUE_SERVE_SELF],
      specialties: [],
      user: { name: "Alex" },
    },
  ],
  owners: [],
};

describe("booking-availability workload model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cachedMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue(
      baseBusiness,
    );
    policyMock.getBookingPolicyByBusinessSlug.mockResolvedValue({
      bookingHorizonDays: 14,
      minLeadMinutes: 30,
      slotIntervalMinutes: 30,
      sameDayAttendanceStrictMinutes: 120,
      allowPublicFullPayment: true,
      allowPublicDownpayment: true,
      defaultPublicPaymentType: "FULL",
      bookingV2Enabled: true,
    });
    prismaMock.service.findMany.mockResolvedValue([
      { id: 1, category: "GENERAL", duration: 30 },
    ]);
    prismaMock.booking.findMany.mockResolvedValue([]);
  });

  it("returns guaranteed workload slots", async () => {
    const slots = await computeSlots({
      businessSlug: "demo-business",
      date: new Date("2026-02-13T00:00:00+08:00"),
      services: [{ id: 1, quantity: 1 }],
      now: new Date("2026-02-12T08:00:00+08:00"),
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].source).toBe("WORKLOAD");
    expect(slots[0].confidence).toBe("GUARANTEED");
    expect(slots[0].availableOwnerCount).toBe(0);
  });

  it("consumes capacity for overlapping unassigned segments", async () => {
    prismaMock.booking.findMany.mockResolvedValue([
      {
        status: "HOLD",
        scheduled_at: new Date("2026-02-12T09:00:00+08:00"),
        estimated_end: new Date("2026-02-12T09:30:00+08:00"),
        availed_services: [
          {
            status: "PENDING",
            scheduled_at: new Date("2026-02-12T09:00:00+08:00"),
            estimated_end: new Date("2026-02-12T09:30:00+08:00"),
            served_by_id: null,
            service: { category: "GENERAL" },
          },
        ],
      },
    ]);

    const slots = await computeSlots({
      businessSlug: "demo-business",
      date: new Date("2026-02-12T00:00:00+08:00"),
      services: [{ id: 1, quantity: 1 }],
      now: new Date("2026-02-12T08:00:00+08:00"),
    });

    const blockedNineAm = slots.find(
      (slot) =>
        slot.startTime.toISOString() ===
        new Date("2026-02-12T09:00:00+08:00").toISOString(),
    );
    expect(blockedNineAm).toBeUndefined();
  });

  it("rejects when there are no qualified employees for selected category", async () => {
    cachedMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({
      ...baseBusiness,
      employees: [
        {
          id: 1,
          profile: StaffProfile.STAFF,
          permissions: [StaffPermission.QUEUE_SERVE_SELF],
          specialties: ["NAILS"],
          user: { name: "Alex" },
        },
      ],
    });
    prismaMock.service.findMany.mockResolvedValue([
      { id: 9, category: "HAIR", duration: 30 },
    ]);

    const slots = await computeSlots({
      businessSlug: "demo-business",
      date: new Date("2026-02-12T00:00:00+08:00"),
      services: [{ id: 9, quantity: 1 }],
      now: new Date("2026-02-12T08:00:00+08:00"),
    });

    expect(slots).toEqual([]);
  });

  it("returns slot just taken when exact slot is no longer available", async () => {
    await expect(
      validateBookingOrThrow({
        businessSlug: "demo-business",
        scheduledAt: new Date("2026-02-12T09:15:00+08:00"),
        services: [{ id: 1, quantity: 1 }],
        paymentType: "FULL",
        isPublicBooking: true,
        isWalkIn: false,
        now: new Date("2026-02-12T08:00:00+08:00"),
      }),
    ).rejects.toMatchObject({
      code: "SLOT_JUST_TAKEN",
    });
  });

  it("rejects required selected staff when selected employee is busy", async () => {
    prismaMock.booking.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          scheduled_at: new Date("2026-02-12T10:00:00+08:00"),
          estimated_end: new Date("2026-02-12T10:30:00+08:00"),
          availed_services: [
            {
              served_by_id: 1,
              scheduled_at: new Date("2026-02-12T10:00:00+08:00"),
              estimated_end: new Date("2026-02-12T10:30:00+08:00"),
            },
          ],
        },
      ]);

    await expect(
      validateBookingOrThrow({
        businessSlug: "demo-business",
        scheduledAt: new Date("2026-02-12T10:00:00+08:00"),
        services: [{ id: 1, quantity: 1 }],
        paymentType: "FULL",
        isPublicBooking: false,
        selectedEmployeeId: 1,
        staffSelectionMode: "REQUIRE_SELECTED",
        now: new Date("2026-02-12T08:00:00+08:00"),
      }),
    ).rejects.toMatchObject({
      code: "REQUIRED_STAFF_UNAVAILABLE",
    });
  });
});
