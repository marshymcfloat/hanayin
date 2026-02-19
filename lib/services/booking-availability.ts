import { getCachedBusinessWithHoursAndEmployees } from "@/lib/data/cached";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { StaffProfile } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import type { Prisma, PrismaClient } from "@/prisma/generated/prisma/client";
import { getBookingPolicyByBusinessSlug } from "./booking-policy";

const MANILA_TIME_ZONE = "Asia/Manila";

type AvailabilityDbClient = PrismaClient | Prisma.TransactionClient;

export interface SelectedServiceInput {
  id: number;
  quantity?: number;
}

export type StaffSelectionMode =
  | "ANY_AVAILABLE"
  | "PREFER_SELECTED"
  | "REQUIRE_SELECTED";

export type CapacityOverrideReason =
  | "LATE_CUSTOMER"
  | "VIP"
  | "MANUAL_EXCEPTION"
  | "SYSTEM_RECOVERY";

export interface CapacityOverrideInput {
  reason: CapacityOverrideReason;
  note?: string;
}

export interface StaffSelectionResolution {
  assignedEmployeeId: number | null;
  assignmentDowngraded: boolean;
  warning?: string;
}

export type SlotAvailabilitySource = "WORKLOAD";
export type SlotConfidence = "GUARANTEED";

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  available: boolean;
  availableEmployeeCount: number;
  availableOwnerCount: number;
  source: SlotAvailabilitySource;
  confidence: SlotConfidence;
}

export type BookingAvailabilityErrorCode =
  | "DATE_OUTSIDE_HORIZON"
  | "LEAD_TIME_VIOLATION"
  | "SLOT_JUST_TAKEN"
  | "PAYMENT_TYPE_NOT_ALLOWED"
  | "NO_CAPACITY_FOR_SELECTED_SERVICES"
  | "PREFERRED_STAFF_UNAVAILABLE"
  | "REQUIRED_STAFF_UNAVAILABLE"
  | "WALK_IN_CAPACITY_EXCEEDED"
  | "CAPACITY_OVERRIDE_NOT_ALLOWED"
  | "CAPACITY_OVERRIDE_REASON_REQUIRED";

export class BookingAvailabilityError extends Error {
  code: BookingAvailabilityErrorCode;
  alternatives: TimeSlot[];

  constructor(
    code: BookingAvailabilityErrorCode,
    message: string,
    alternatives: TimeSlot[] = [],
  ) {
    super(message);
    this.name = "BookingAvailabilityError";
    this.code = code;
    this.alternatives = alternatives;
  }
}

function getPHDateComponents(d: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const getPart = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
    second: getPart("second"),
  };
}

function toPHDateString(d: Date) {
  const parts = getPHDateComponents(d);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getPHDayOfWeek(d: Date) {
  const dateStr = toPHDateString(d);
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function getPHDayBounds(date: Date) {
  const dateStr = toPHDateString(date);
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dateStr, dayStart, dayEnd };
}

type BusinessContext = NonNullable<
  Awaited<ReturnType<typeof getCachedBusinessWithHoursAndEmployees>>
>;

type BookedServiceSegment = {
  start: Date;
  end: Date;
  category: string;
  servedByEmployeeId: number | null;
};

type SegmentAvailability = {
  availableEmployees: number;
  totalAvailable: number;
};

function isBookingServiceEmployee(
  employee: BusinessContext["employees"][number],
) {
  return employee.profile === StaffProfile.STAFF;
}

async function getBusinessContext(
  db: AvailabilityDbClient,
  businessSlug: string,
): Promise<BusinessContext> {
  if (db === prisma) {
    const cached = await getCachedBusinessWithHoursAndEmployees(businessSlug);
    if (!cached) {
      throw new Error("Business not found");
    }
    return cached;
  }

  const business = await db.business.findUnique({
    where: { slug: businessSlug },
    include: {
      business_hours: true,
      employees: {
        include: {
          user: { select: { name: true } },
        },
      },
      owners: {
        select: {
          id: true,
          specialties: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  return business as BusinessContext;
}

function isWithinWindows(
  start: Date,
  end: Date,
  windows: { start: Date; end: Date }[],
) {
  return windows.some((window) => start >= window.start && end <= window.end);
}

function normalizeSlotIntervalMinutes(value: number) {
  if (!Number.isFinite(value)) return 30;
  return Math.max(5, Math.floor(value));
}

function applyUnassignedLoadToAvailability({
  availableEmployees,
  unassignedCount,
}: {
  availableEmployees: number;
  unassignedCount: number;
}) {
  let nextEmployees = Math.max(0, availableEmployees);
  let remainingUnassigned = Math.max(0, unassignedCount);

  if (remainingUnassigned > 0) {
    const employeeReduction = Math.min(remainingUnassigned, nextEmployees);
    nextEmployees -= employeeReduction;
    remainingUnassigned -= employeeReduction;
  }

  return {
    availableEmployees: nextEmployees,
  };
}

function computeSegmentAvailability({
  category,
  start,
  end,
  bookedSegments,
  eligibleEmployeeIds,
}: {
  category: string;
  start: Date;
  end: Date;
  bookedSegments: BookedServiceSegment[];
  eligibleEmployeeIds: number[];
}): SegmentAvailability {
  if (eligibleEmployeeIds.length === 0) {
    return {
      availableEmployees: 0,
      totalAvailable: 0,
    };
  }

  const eligibleEmployeeSet = new Set(eligibleEmployeeIds);
  const busyEmployees = new Set<number>();
  let unassignedOverlapCount = 0;
  const normalizedServiceCategory = category.toLowerCase();

  for (const segment of bookedSegments) {
    if (segment.category !== normalizedServiceCategory) continue;
    const overlaps = start < segment.end && end > segment.start;
    if (!overlaps) continue;

    if (segment.servedByEmployeeId) {
      if (eligibleEmployeeSet.has(segment.servedByEmployeeId)) {
        busyEmployees.add(segment.servedByEmployeeId);
      }
      continue;
    }

    unassignedOverlapCount += 1;
  }

  const adjusted = applyUnassignedLoadToAvailability({
    availableEmployees: eligibleEmployeeIds.length - busyEmployees.size,
    unassignedCount: unassignedOverlapCount,
  });

  return {
    availableEmployees: adjusted.availableEmployees,
    totalAvailable: adjusted.availableEmployees,
  };
}

async function getBookedServiceSegmentsForDay({
  db,
  businessId,
  dayStart,
  dayEnd,
}: {
  db: AvailabilityDbClient;
  businessId: string;
  dayStart: Date;
  dayEnd: Date;
}) {
  const existingBookings = await db.booking.findMany({
    where: {
      business_id: businessId,
      scheduled_at: {
        gte: dayStart,
        lte: dayEnd,
      },
      status: {
        not: "CANCELLED",
      },
    },
    include: {
      availed_services: {
        include: {
          service: {
            select: {
              category: true,
            },
          },
        },
      },
    },
  });

  const segments: BookedServiceSegment[] = [];
  for (const booking of existingBookings) {
    for (const availed of booking.availed_services) {
      if (availed.status === "CANCELLED") continue;

      const start = availed.scheduled_at || booking.scheduled_at;
      const end = availed.estimated_end || booking.estimated_end;
      if (!start || !end) continue;

      segments.push({
        start,
        end,
        category: availed.service.category.toLowerCase(),
        servedByEmployeeId: availed.served_by_id,
      });
    }
  }

  return segments;
}

async function evaluateSelectedEmployeeAvailability({
  db,
  business,
  selectedEmployeeId,
  scheduledAt,
  services,
}: {
  db: AvailabilityDbClient;
  business: BusinessContext;
  selectedEmployeeId: number;
  scheduledAt: Date;
  services: SelectedServiceInput[];
}) {
  const selectedEmployee = business.employees.find(
    (employee) => employee.id === selectedEmployeeId,
  );
  if (!selectedEmployee) {
    return { available: false, reason: "Employee not found in this business." };
  }
  if (!isBookingServiceEmployee(selectedEmployee)) {
    return {
      available: false,
      reason: "Selected staff is not eligible for service bookings.",
    };
  }

  const serviceRecords = await db.service.findMany({
    where: {
      id: { in: services.map((service) => service.id) },
      business_id: business.id,
    },
    select: {
      id: true,
      category: true,
      duration: true,
    },
  });
  if (serviceRecords.length === 0) {
    return { available: false, reason: "No valid services for this booking." };
  }

  const serviceById = new Map(serviceRecords.map((service) => [service.id, service]));
  const expandedServices = services.flatMap((serviceInput) => {
    const service = serviceById.get(serviceInput.id);
    if (!service) return [];
    const quantity = Math.max(1, Number(serviceInput.quantity) || 1);
    return Array.from({ length: quantity }).map(() => ({
      category: service.category,
      duration: service.duration || 30,
    }));
  });
  if (expandedServices.length === 0) {
    return { available: false, reason: "Selected services were not found." };
  }

  const requiredCategories = new Set(
    expandedServices.map((service) => service.category.toLowerCase()),
  );
  const employeeSpecialties = selectedEmployee.specialties.map((specialty) =>
    specialty.toLowerCase(),
  );
  const isGeneralist = employeeSpecialties.length === 0;
  const isQualified =
    isGeneralist ||
    Array.from(requiredCategories).every((category) =>
      employeeSpecialties.includes(category),
    );
  if (!isQualified) {
    return {
      available: false,
      reason: "Selected staff is not qualified for all selected services.",
    };
  }

  const { dayStart, dayEnd } = getPHDayBounds(scheduledAt);

  const existingBookings = await db.booking.findMany({
    where: {
      business_id: business.id,
      status: { not: "CANCELLED" },
      scheduled_at: {
        gte: dayStart,
        lte: dayEnd,
      },
    },
    include: {
      availed_services: {
        where: {
          status: {
            not: "CANCELLED",
          },
        },
        select: {
          served_by_id: true,
          scheduled_at: true,
          estimated_end: true,
        },
      },
    },
  });

  let cursor = new Date(scheduledAt);
  for (const service of expandedServices) {
    const serviceEnd = new Date(cursor.getTime() + service.duration * 60 * 1000);

    const hasOverlap = existingBookings.some((booking) =>
      booking.availed_services.some((serviceEntry) => {
        if (serviceEntry.served_by_id !== selectedEmployeeId) return false;
        const serviceStart = serviceEntry.scheduled_at || booking.scheduled_at;
        const serviceFinish = serviceEntry.estimated_end || booking.estimated_end;
        if (!serviceStart || !serviceFinish) return false;
        return cursor < serviceFinish && serviceEnd > serviceStart;
      }),
    );

    if (hasOverlap) {
      return {
        available: false,
        reason: "Selected staff is already serving another booking.",
      };
    }

    cursor = serviceEnd;
  }

  return { available: true as const };
}

function resolveBusinessHoursWindows({
  business,
  dayOfWeek,
  dateStr,
}: {
  business: BusinessContext;
  dayOfWeek: number;
  dateStr: string;
}) {
  const hoursCache = new Map<
    string,
    { windows: { start: Date; end: Date }[]; windowMinutes: number }
  >();

  const buildWindowsForHours = (hours: {
    open_time: string;
    close_time: string;
    is_closed: boolean;
  }) => {
    if (hours.is_closed) return [] as { start: Date; end: Date }[];

    const openTime = new Date(`${dateStr}T${hours.open_time}:00+08:00`);
    const closeTime = new Date(`${dateStr}T${hours.close_time}:00+08:00`);

    if (hours.open_time === hours.close_time) {
      const fullStart = new Date(`${dateStr}T00:00:00+08:00`);
      return [
        {
          start: fullStart,
          end: new Date(fullStart.getTime() + 24 * 60 * 60 * 1000),
        },
      ];
    }

    if (openTime < closeTime) {
      return [{ start: openTime, end: closeTime }];
    }

    const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return [
      { start: openTime, end: dayEnd },
      { start: dayStart, end: closeTime },
    ];
  };

  const sumWindowMinutes = (windows: { start: Date; end: Date }[]) =>
    windows.reduce(
      (total, window) =>
        total + (window.end.getTime() - window.start.getTime()) / 60000,
      0,
    );

  return (category: string) => {
    const key = category.toLowerCase();
    const cached = hoursCache.get(key);
    if (cached) return cached;

    let businessHours = business.business_hours.find(
      (h) =>
        h.day_of_week === dayOfWeek && h.category.toLowerCase() === key,
    );
    if (!businessHours) {
      businessHours = business.business_hours.find(
        (h) =>
          h.day_of_week === dayOfWeek && h.category.toLowerCase() === "general",
      );
    }

    if (!businessHours) {
      const empty = { windows: [], windowMinutes: 0 };
      hoursCache.set(key, empty);
      return empty;
    }

    const windows = buildWindowsForHours(businessHours);
    const windowMinutes = sumWindowMinutes(windows);
    const result = { windows, windowMinutes };
    hoursCache.set(key, result);
    return result;
  };
}

function getHorizonDayDiff(date: Date, now: Date) {
  const { dayStart: selectedDayStart } = getPHDayBounds(date);
  const { dayStart: todayStart } = getPHDayBounds(now);
  return Math.floor(
    (selectedDayStart.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000),
  );
}

export async function resolveStaffSelectionOrThrow({
  businessSlug,
  scheduledAt,
  services,
  selectedEmployeeId,
  staffSelectionMode = "ANY_AVAILABLE",
  db = prisma,
}: {
  businessSlug: string;
  scheduledAt: Date;
  services: SelectedServiceInput[];
  selectedEmployeeId?: number;
  staffSelectionMode?: StaffSelectionMode;
  db?: AvailabilityDbClient;
}): Promise<StaffSelectionResolution> {
  if (!selectedEmployeeId || staffSelectionMode === "ANY_AVAILABLE") {
    return {
      assignedEmployeeId: null,
      assignmentDowngraded: false,
    };
  }

  const business = await getBusinessContext(db, businessSlug);

  const selectedAvailable = await evaluateSelectedEmployeeAvailability({
    db,
    business,
    selectedEmployeeId,
    scheduledAt,
    services,
  });

  if (selectedAvailable.available) {
    return {
      assignedEmployeeId: selectedEmployeeId,
      assignmentDowngraded: false,
    };
  }

  if (staffSelectionMode === "REQUIRE_SELECTED") {
    throw new BookingAvailabilityError(
      "REQUIRED_STAFF_UNAVAILABLE",
      selectedAvailable.reason || "Selected staff is unavailable for this slot.",
    );
  }

  return {
    assignedEmployeeId: null,
    assignmentDowngraded: true,
    warning: "Preferred staff unavailable; booking kept with any available provider.",
  };
}

export async function computeSlots({
  businessSlug,
  date,
  services,
  slotIntervalMinutes,
  ignoreMinLead = false,
  now = getCurrentDateTimePH(),
  db = prisma,
}: {
  businessSlug: string;
  date: Date;
  services: SelectedServiceInput[];
  slotIntervalMinutes?: number;
  ignoreMinLead?: boolean;
  now?: Date;
  db?: AvailabilityDbClient;
}): Promise<TimeSlot[]> {
  if (!services || services.length === 0) return [];

  const [business, policy] = await Promise.all([
    getBusinessContext(db, businessSlug),
    getBookingPolicyByBusinessSlug(db, businessSlug),
  ]);

  const dayDiff = getHorizonDayDiff(date, now);
  if (dayDiff < 0 || dayDiff >= policy.bookingHorizonDays) {
    return [];
  }

  if (!policy.bookingV2Enabled && dayDiff > 0) {
    return [];
  }

  const dayOfWeek = getPHDayOfWeek(date);
  const { dateStr, dayStart, dayEnd } = getPHDayBounds(date);
  const nowStr = toPHDateString(now);
  const phNow = getPHDateComponents(now);
  const phNowDate = new Date(
    `${nowStr}T${phNow.hour}:${phNow.minute}:${phNow.second}+08:00`,
  );
  const effectiveSlotInterval = normalizeSlotIntervalMinutes(
    slotIntervalMinutes ?? policy.slotIntervalMinutes,
  );

  const selectedServiceRecords = await db.service.findMany({
    where: {
      id: { in: services.map((s) => s.id) },
      business_id: business.id,
    },
    select: {
      id: true,
      category: true,
      duration: true,
    },
  });
  const serviceRecordMap = new Map(
    selectedServiceRecords.map((service) => [service.id, service]),
  );

  const getHoursMeta = resolveBusinessHoursWindows({
    business,
    dayOfWeek,
    dateStr,
  });

  const serviceEntries = services.flatMap((serviceInput) => {
    const record = serviceRecordMap.get(serviceInput.id);
    if (!record) return [];
    const quantity = Math.max(1, Number(serviceInput.quantity) || 1);
    const duration = record.duration || 30;
    return Array.from({ length: quantity }).map(() => ({
      id: record.id,
      category: record.category,
      duration,
      hoursMeta: getHoursMeta(record.category),
    }));
  });

  if (serviceEntries.length === 0) return [];
  if (serviceEntries.some((entry) => entry.hoursMeta.windowMinutes <= 0)) {
    return [];
  }

  const orderedServices = [...serviceEntries].sort((a, b) => {
    if (a.hoursMeta.windowMinutes !== b.hoursMeta.windowMinutes) {
      return a.hoursMeta.windowMinutes - b.hoursMeta.windowMinutes;
    }
    if (a.duration !== b.duration) {
      return b.duration - a.duration;
    }
    return a.id - b.id;
  });

  const bookedSegments = await getBookedServiceSegmentsForDay({
    db,
    businessId: business.id,
    dayStart,
    dayEnd,
  });

  const qualifiedProvidersByCategory = new Map<string, number[]>();
  const getQualifiedProviderIds = (category: string) => {
    const key = category.toLowerCase();
    const cached = qualifiedProvidersByCategory.get(key);
    if (cached) return cached;

    const employeeIds = business.employees
      .filter(
        (emp) =>
          isBookingServiceEmployee(emp) &&
          (emp.specialties.length === 0 ||
            emp.specialties.some((specialty) => specialty.toLowerCase() === key)),
      )
      .map((emp) => emp.id);

    qualifiedProvidersByCategory.set(key, employeeIds);
    return employeeIds;
  };

  const earliestWindowStart = Math.min(
    ...orderedServices.flatMap((entry) =>
      entry.hoursMeta.windows.map((window) => window.start.getTime()),
    ),
  );
  const latestWindowEnd = Math.max(
    ...orderedServices.flatMap((entry) =>
      entry.hoursMeta.windows.map((window) => window.end.getTime()),
    ),
  );

  const minLeadStart = ignoreMinLead
    ? new Date(dayStart)
    : new Date(phNowDate.getTime() + policy.minLeadMinutes * 60000);
  let currentSlotStart = new Date(Math.max(dayStart.getTime(), earliestWindowStart));
  const slotEndLimit = new Date(Math.min(dayEnd.getTime(), latestWindowEnd));
  const slots: TimeSlot[] = [];

  while (currentSlotStart < slotEndLimit) {
    if (currentSlotStart < minLeadStart) {
      currentSlotStart = new Date(
        currentSlotStart.getTime() + effectiveSlotInterval * 60 * 1000,
      );
      continue;
    }

    let cursor = new Date(currentSlotStart);
    let availableEmployeeCount = Number.POSITIVE_INFINITY;
    let slotFits = true;

    for (const service of orderedServices) {
      const serviceEnd = new Date(cursor.getTime() + service.duration * 60 * 1000);
      if (!isWithinWindows(cursor, serviceEnd, service.hoursMeta.windows)) {
        slotFits = false;
        break;
      }

      const qualifiedEmployeeIds = getQualifiedProviderIds(service.category);
      const workloadCapacity = computeSegmentAvailability({
        category: service.category,
        start: cursor,
        end: serviceEnd,
        bookedSegments,
        eligibleEmployeeIds: qualifiedEmployeeIds,
      });

      if (workloadCapacity.totalAvailable <= 0) {
        slotFits = false;
        break;
      }

      availableEmployeeCount = Math.min(
        availableEmployeeCount,
        workloadCapacity.availableEmployees,
      );

      cursor = serviceEnd;
    }

    if (slotFits) {
      const normalizedEmployeeCount =
        availableEmployeeCount === Number.POSITIVE_INFINITY
          ? 0
          : Math.max(0, availableEmployeeCount);

      slots.push({
        startTime: new Date(currentSlotStart),
        endTime: new Date(cursor),
        available: true,
        availableEmployeeCount: normalizedEmployeeCount,
        availableOwnerCount: 0,
        source: "WORKLOAD",
        confidence: "GUARANTEED",
      });
    }

    currentSlotStart = new Date(
      currentSlotStart.getTime() + effectiveSlotInterval * 60 * 1000,
    );
  }

  return slots;
}

export async function listAlternativeSlots({
  businessSlug,
  scheduledAt,
  services,
  limit = 6,
  db = prisma,
}: {
  businessSlug: string;
  scheduledAt: Date;
  services: SelectedServiceInput[];
  limit?: number;
  db?: AvailabilityDbClient;
}) {
  const policy = await getBookingPolicyByBusinessSlug(db, businessSlug);
  const now = getCurrentDateTimePH();
  const startDiff = Math.max(0, getHorizonDayDiff(scheduledAt, now));
  const collected: TimeSlot[] = [];

  for (let dayOffset = startDiff; dayOffset < policy.bookingHorizonDays; dayOffset++) {
    const targetDay = new Date(
      getPHDayBounds(now).dayStart.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
    const daySlots = await computeSlots({
      businessSlug,
      date: targetDay,
      services,
      db,
      now,
    });

    const filtered = dayOffset === startDiff
      ? daySlots.filter((slot) => slot.startTime.getTime() > scheduledAt.getTime())
      : daySlots;

    collected.push(...filtered);
    if (collected.length >= limit) {
      return collected.slice(0, limit);
    }
  }

  return collected.slice(0, limit);
}

export async function validateBookingOrThrow({
  businessSlug,
  scheduledAt,
  services,
  paymentType,
  isPublicBooking,
  isWalkIn = false,
  selectedEmployeeId,
  staffSelectionMode = "ANY_AVAILABLE",
  allowWalkInCapacityBypass = false,
  capacityOverride,
  now = getCurrentDateTimePH(),
  db = prisma,
}: {
  businessSlug: string;
  scheduledAt: Date;
  services: SelectedServiceInput[];
  paymentType: "FULL" | "DOWNPAYMENT";
  isPublicBooking: boolean;
  isWalkIn?: boolean;
  selectedEmployeeId?: number;
  staffSelectionMode?: StaffSelectionMode;
  allowWalkInCapacityBypass?: boolean;
  capacityOverride?: CapacityOverrideInput;
  now?: Date;
  db?: AvailabilityDbClient;
}) {
  const policy = await getBookingPolicyByBusinessSlug(db, businessSlug);
  if (isPublicBooking) {
    if (
      (paymentType === "FULL" && !policy.allowPublicFullPayment) ||
      (paymentType === "DOWNPAYMENT" && !policy.allowPublicDownpayment)
    ) {
      throw new BookingAvailabilityError(
        "PAYMENT_TYPE_NOT_ALLOWED",
        "Selected payment type is not available for this booking.",
      );
    }
  }

  if (isWalkIn && allowWalkInCapacityBypass) {
    if (!capacityOverride?.reason) {
      throw new BookingAvailabilityError(
        "CAPACITY_OVERRIDE_REASON_REQUIRED",
        "Capacity override reason is required for walk-in bypass.",
      );
    }
  }

  if (!isWalkIn) {
    const dayDiff = getHorizonDayDiff(scheduledAt, now);
    if (dayDiff < 0 || dayDiff >= policy.bookingHorizonDays) {
      throw new BookingAvailabilityError(
        "DATE_OUTSIDE_HORIZON",
        "Selected date is outside the booking window.",
      );
    }

    const minLeadStart = new Date(
      now.getTime() + policy.minLeadMinutes * 60 * 1000,
    );
    if (scheduledAt.getTime() < minLeadStart.getTime()) {
      throw new BookingAvailabilityError(
        "LEAD_TIME_VIOLATION",
        "Selected time is too soon. Please choose a later slot.",
      );
    }
  }

  let daySlots: TimeSlot[] = [];

  if (!allowWalkInCapacityBypass) {
    daySlots = await computeSlots({
      businessSlug,
      date: scheduledAt,
      services,
      slotIntervalMinutes: policy.slotIntervalMinutes,
      ignoreMinLead: isWalkIn,
      now,
      db,
    });
  }

  if (!allowWalkInCapacityBypass) {
    if (daySlots.length === 0) {
      const alternatives = await listAlternativeSlots({
        businessSlug,
        scheduledAt,
        services,
        db,
      });
      throw new BookingAvailabilityError(
        isWalkIn
          ? "WALK_IN_CAPACITY_EXCEEDED"
          : "NO_CAPACITY_FOR_SELECTED_SERVICES",
        isWalkIn
          ? "No immediate capacity is available for this walk-in booking."
          : "No capacity is available for the selected services.",
        alternatives,
      );
    }

    const exactMatch = daySlots.some(
      (slot) => slot.startTime.getTime() === scheduledAt.getTime(),
    );
    if (!exactMatch) {
      const alternatives = await listAlternativeSlots({
        businessSlug,
        scheduledAt,
        services,
        db,
      });
      throw new BookingAvailabilityError(
        isWalkIn ? "WALK_IN_CAPACITY_EXCEEDED" : "SLOT_JUST_TAKEN",
        isWalkIn
          ? "No immediate capacity is available for this walk-in booking."
          : "The selected slot is no longer available.",
        alternatives,
      );
    }
  }

  await resolveStaffSelectionOrThrow({
    businessSlug,
    scheduledAt,
    services,
    selectedEmployeeId,
    staffSelectionMode,
    db,
  });
}
