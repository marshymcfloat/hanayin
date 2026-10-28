import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeSlots,
  listAlternativeSlots,
  resolveStaffSelectionOrThrow,
  validateBookingOrThrow,
} from "@/features/bookings/services/booking-availability";
import { StaffPermission, StaffProfile } from "@/prisma/generated/prisma/enums";

const prismaMock = vi.hoisted(() => ({
  service: { findMany: vi.fn() },
  booking: { findMany: vi.fn() },
  employeeAttendance: { findMany: vi.fn() },
  leaveRequest: { findMany: vi.fn() },
}));

const cachedMock = vi.hoisted(() => ({
  getCachedBusinessWithHoursAndEmployees: vi.fn(),
}));

const policyMock = vi.hoisted(() => ({
  getBookingPolicyByBusinessSlug: vi.fn(),
}));

vi.mock("@/prisma/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/data/cached", () => cachedMock);
vi.mock("@/lib/services/booking-policy", () => policyMock);
vi.mock("@/lib/date-utils", () => ({
  getCurrentDateTimePH: vi.fn(() => new Date("2026-02-12T08:00:00+08:00")),
}));

const baseBusiness = {
  id: "biz_1",
  manager_can_serve: true,
  formal_schedule_enabled: false,
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
      recurring_days_off: [],
      schedule: [],
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
      downpaymentPercentage: 50,
      bookingV2Enabled: true,
    });
    prismaMock.service.findMany.mockResolvedValue([
      { id: 1, category: "GENERAL", duration: 30 },
    ]);
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.employeeAttendance.findMany.mockResolvedValue([]);
    prismaMock.leaveRequest.findMany.mockResolvedValue([]);
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

  it("preserves default alternative count and strictly later chronological slots", async () => {
    const scheduledAt = new Date("2026-02-12T09:00:00+08:00");
    const alternatives = await listAlternativeSlots({ businessSlug: "demo-business", scheduledAt, services: [{ id: 1 }] });
    expect(alternatives).toHaveLength(6);
    expect(alternatives[0].startTime).toEqual(new Date("2026-02-12T09:30:00+08:00"));
    expect(alternatives.every(slot => slot.startTime > scheduledAt)).toBe(true);
    expect(alternatives.map(slot => slot.startTime.getTime())).toEqual([...alternatives].map(slot => slot.startTime.getTime()).sort((a, b) => a - b));
    expect(cachedMock.getCachedBusinessWithHoursAndEmployees).toHaveBeenCalledTimes(1);
    expect(policyMock.getBookingPolicyByBusinessSlug).toHaveBeenCalledTimes(1);
  });

  it("preserves late-day alternatives across days and explicit result limits", async () => {
    const alternatives = await listAlternativeSlots({ businessSlug: "demo-business", scheduledAt: new Date("2026-02-12T17:30:00+08:00"), services: [{ id: 1 }], limit: 2 });
    expect(alternatives.map(slot => slot.startTime)).toEqual([new Date("2026-02-13T09:00:00+08:00"), new Date("2026-02-13T09:30:00+08:00")]);
  });

  it("retains empty alternatives beyond the policy horizon without day queries", async () => {
    expect(await listAlternativeSlots({ businessSlug: "demo-business", scheduledAt: new Date("2026-03-01T09:00:00+08:00"), services: [{ id: 1 }] })).toEqual([]);
    expect(prismaMock.service.findMany).not.toHaveBeenCalled();
  });

  it("retains booking rejection and populated alternatives for an unavailable exact slot", async () => {
    await expect(validateBookingOrThrow({ businessSlug: "demo-business", scheduledAt: new Date("2026-02-12T09:15:00+08:00"), services: [{ id: 1 }], paymentType: "FULL", isPublicBooking: true, now: new Date("2026-02-12T08:00:00+08:00") })).rejects.toMatchObject({ code: "SLOT_JUST_TAKEN", alternatives: expect.arrayContaining([expect.objectContaining({ startTime: new Date("2026-02-12T09:30:00+08:00") })]) });
  });

  it("bounds actual engine day queries to 90 for an empty large horizon", async () => {
    policyMock.getBookingPolicyByBusinessSlug.mockResolvedValue({ bookingHorizonDays: 100_000, bookingV2Enabled: true, minLeadMinutes: 30, slotIntervalMinutes: 30 });
    cachedMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({ ...baseBusiness, business_hours: [] });
    expect(await listAlternativeSlots({ businessSlug: "demo-business", scheduledAt: new Date("2026-02-12T09:00:00+08:00"), services: [{ id: 1 }] })).toEqual([]);
    expect(prismaMock.service.findMany).toHaveBeenCalledTimes(90);
    expect(cachedMock.getCachedBusinessWithHoursAndEmployees).toHaveBeenCalledTimes(1);
    expect(policyMock.getBookingPolicyByBusinessSlug).toHaveBeenCalledTimes(1);
  });

  it("still searches far-future dates inside the stored horizon", async () => {
    policyMock.getBookingPolicyByBusinessSlug.mockResolvedValue({ bookingHorizonDays: 1000, bookingV2Enabled: true, minLeadMinutes: 30, slotIntervalMinutes: 30 });
    cachedMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({ ...baseBusiness, business_hours: Array.from({ length: 7 }, (_, day_of_week) => ({ day_of_week, category: "GENERAL", open_time: "09:00", close_time: "18:00", is_closed: false })) });
    const scheduledAt = new Date(new Date("2026-02-12T09:00:00+08:00").getTime() + 500 * 86400000);
    const result = await listAlternativeSlots({ businessSlug: "demo-business", scheduledAt, services: [{ id: 1 }], limit: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].startTime.getTime()).toBe(scheduledAt.getTime() + 30 * 60000);
    expect(prismaMock.service.findMany).toHaveBeenCalledTimes(1);
  });

  it.each(["NO_CAPACITY_FOR_SELECTED_SERVICES", "SLOT_JUST_TAKEN"])("keeps %s rejection when bounded alternatives are empty", async code => {
    policyMock.getBookingPolicyByBusinessSlug.mockResolvedValue({ bookingHorizonDays: 100_000, bookingV2Enabled: true, minLeadMinutes: 30, slotIntervalMinutes: 30 });
    prismaMock.service.findMany.mockResolvedValue([]);
    if (code === "SLOT_JUST_TAKEN") prismaMock.service.findMany.mockResolvedValueOnce([{ id: 1, category: "GENERAL", duration: 30 }]);
    await expect(validateBookingOrThrow({ businessSlug: "demo-business", scheduledAt: new Date("2026-02-12T09:15:00+08:00"), services: [{ id: 1 }], paymentType: "FULL", isPublicBooking: false, now: new Date("2026-02-12T08:00:00+08:00") })).rejects.toMatchObject({ code, alternatives: [] });
    expect(prismaMock.service.findMany).toHaveBeenCalledTimes(91);
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
          recurring_days_off: [],
          schedule: [],
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

  it("counts an owner only when the service category is an explicit specialty", async () => {
    cachedMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({
      ...baseBusiness,
      employees: [],
      owners: [
        { id: 10, specialties: ["HAIR"], user: { name: "Owner" } },
        { id: 11, specialties: [], user: { name: "Non-serving owner" } },
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

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].availableEmployeeCount).toBe(0);
    expect(slots[0].availableOwnerCount).toBe(1);
  });

  it("does not treat an owner with no specialties as a provider", async () => {
    cachedMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({
      ...baseBusiness,
      employees: [],
      owners: [{ id: 11, specialties: [], user: { name: "Owner" } }],
    });

    const slots = await computeSlots({
      businessSlug: "demo-business",
      date: new Date("2026-02-12T00:00:00+08:00"),
      services: [{ id: 1, quantity: 1 }],
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

  it("excludes employees whose recurring_days_off covers the booking date", async () => {
    // Feb 12 2026 is a Thursday (day_of_week=4). With Anna marked off
    // every Thursday and no other staff, the day yields zero slots.
    cachedMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({
      ...baseBusiness,
      employees: [
        {
          id: 1,
          profile: StaffProfile.STAFF,
          permissions: [StaffPermission.QUEUE_SERVE_SELF],
          specialties: [],
          recurring_days_off: [4],
          schedule: [],
          user: { name: "Alex" },
        },
      ],
    });

    const slots = await computeSlots({
      businessSlug: "demo-business",
      date: new Date("2026-02-12T00:00:00+08:00"),
      services: [{ id: 1, quantity: 1 }],
      now: new Date("2026-02-12T08:00:00+08:00"),
    });

    expect(slots).toEqual([]);
  });

  it("rejects required selected staff when only that employee is off on this day-of-week", async () => {
    // Two employees: Alex is generalist & always available, Bob is off
    // every Thursday. Booking on Thursday with REQUIRE_SELECTED=Bob
    // should surface REQUIRED_STAFF_UNAVAILABLE because slots still
    // exist for Alex but Bob specifically cannot serve.
    cachedMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({
      ...baseBusiness,
      employees: [
        {
          id: 1,
          profile: StaffProfile.STAFF,
          permissions: [StaffPermission.QUEUE_SERVE_SELF],
          specialties: [],
          recurring_days_off: [],
          schedule: [],
          user: { name: "Alex" },
        },
        {
          id: 2,
          profile: StaffProfile.STAFF,
          permissions: [StaffPermission.QUEUE_SERVE_SELF],
          specialties: [],
          recurring_days_off: [4],
          schedule: [],
          user: { name: "Bob" },
        },
      ],
    });

    await expect(
      resolveStaffSelectionOrThrow({
        businessSlug: "demo-business",
        scheduledAt: new Date("2026-02-12T10:00:00+08:00"),
        services: [{ id: 1, quantity: 1 }],
        selectedEmployeeId: 2,
        staffSelectionMode: "REQUIRE_SELECTED",
      }),
    ).rejects.toMatchObject({
      code: "REQUIRED_STAFF_UNAVAILABLE",
    });
  });

  it("ignores formal schedule when formal_schedule_enabled is false", async () => {
    // Even with a schedule row that says "only 9-10 AM", the flag is
    // off so the existing 9-6 PM behavior wins. Schedule rows are dormant.
    cachedMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({
      ...baseBusiness,
      formal_schedule_enabled: false,
      employees: [
        {
          id: 1,
          profile: StaffProfile.STAFF,
          permissions: [StaffPermission.QUEUE_SERVE_SELF],
          specialties: [],
          recurring_days_off: [],
          schedule: [
            { day_of_week: 4, start_time: "09:00", end_time: "10:00" },
          ],
          user: { name: "Alex" },
        },
      ],
    });

    const slots = await computeSlots({
      businessSlug: "demo-business",
      date: new Date("2026-02-12T00:00:00+08:00"),
      services: [{ id: 1, quantity: 1 }],
      now: new Date("2026-02-12T08:00:00+08:00"),
    });

    // 9-10 schedule but flag off → should still see slots after 10am.
    expect(slots.find((s) =>
      s.startTime.toISOString() === new Date("2026-02-12T11:00:00+08:00").toISOString(),
    )).toBeDefined();
  });

  it("constrains slots to the schedule window when formal_schedule_enabled is true", async () => {
    // Same data, flag on → only 9-10 slots count for Alex. Past 10am
    // there's no qualified employee, so no slots.
    cachedMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({
      ...baseBusiness,
      formal_schedule_enabled: true,
      employees: [
        {
          id: 1,
          profile: StaffProfile.STAFF,
          permissions: [StaffPermission.QUEUE_SERVE_SELF],
          specialties: [],
          recurring_days_off: [],
          schedule: [
            { day_of_week: 4, start_time: "09:00", end_time: "10:00" },
          ],
          user: { name: "Alex" },
        },
      ],
    });

    const slots = await computeSlots({
      businessSlug: "demo-business",
      date: new Date("2026-02-12T00:00:00+08:00"),
      services: [{ id: 1, quantity: 1 }],
      now: new Date("2026-02-12T08:00:00+08:00"),
    });

    // Slots after 10am should be empty (Alex isn't scheduled).
    const nineAm = new Date("2026-02-12T09:00:00+08:00").toISOString();
    const elevenAm = new Date("2026-02-12T11:00:00+08:00").toISOString();
    expect(slots.find((s) => s.startTime.toISOString() === nineAm)).toBeDefined();
    expect(slots.find((s) => s.startTime.toISOString() === elevenAm)).toBeUndefined();
  });

  it("falls back to default behavior when formal flag is on but employee has no schedule rows", async () => {
    // Critical safety case: flipping the flag without setting schedules
    // shouldn't hide every employee. Empty schedule[] = "use default".
    cachedMock.getCachedBusinessWithHoursAndEmployees.mockResolvedValue({
      ...baseBusiness,
      formal_schedule_enabled: true,
      employees: [
        {
          id: 1,
          profile: StaffProfile.STAFF,
          permissions: [StaffPermission.QUEUE_SERVE_SELF],
          specialties: [],
          recurring_days_off: [],
          schedule: [],
          user: { name: "Alex" },
        },
      ],
    });

    const slots = await computeSlots({
      businessSlug: "demo-business",
      date: new Date("2026-02-12T00:00:00+08:00"),
      services: [{ id: 1, quantity: 1 }],
      now: new Date("2026-02-12T08:00:00+08:00"),
    });

    expect(slots.length).toBeGreaterThan(0);
  });
});
