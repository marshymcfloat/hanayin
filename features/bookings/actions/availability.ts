"use server";

// Feature-owned Server Action boundary.

import {
  getCachedBusinessBySlug,
  getCachedBusinessWithHoursAndEmployees,
} from "@/lib/data/cached";
import { authOptions } from "@/features/auth/auth-options";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFromForwardedFor } from "@/lib/client-ip";
import { getBookingPolicyByBusinessSlug } from "@/lib/services/booking-policy";
import { recordBookingMetric } from "@/features/bookings/services/booking-metrics";
import {
  computeSlots,
  listAlternativeSlots,
} from "@/features/bookings/services/booking-availability";
import { StaffProfile } from "@/prisma/generated/prisma/enums";
import type {
  SelectedServiceInput,
  TimeSlot,
} from "@/features/bookings/services/booking-availability";
import { prisma } from "@/prisma/prisma";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";

export interface GetAvailableSlotsParams {
  businessSlug: string;
  date: Date;
  services: SelectedServiceInput[];
  slotIntervalMinutes?: number;
}

const MANILA_TIME_ZONE = "Asia/Manila";

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

function getPHDayBounds(date: Date) {
  const dateStr = toPHDateString(date);
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dateStr, dayStart, dayEnd };
}

function buildWindowsForHours({
  dateStr,
  openTime,
  closeTime,
}: {
  dateStr: string;
  openTime: string;
  closeTime: string;
}) {
  const start = new Date(`${dateStr}T${openTime}:00+08:00`);
  const end = new Date(`${dateStr}T${closeTime}:00+08:00`);

  if (openTime === closeTime) {
    const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
    return [{ start: dayStart, end: new Date(dayStart.getTime() + 86400000) }];
  }

  if (start < end) return [{ start, end }];

  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  return [
    { start, end: dayEnd },
    { start: dayStart, end },
  ];
}

function isBookingServiceEmployee(employee: {
  profile: StaffProfile;
}) {
  return employee.profile === StaffProfile.STAFF;
}

async function applyAvailabilityRateLimit(businessSlug: string, kind: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return;

  const headersList = await headers();
  const clientIp = clientIpFromForwardedFor(headersList.get("x-forwarded-for"));
  const limiter = await rateLimit(`public-availability:${kind}:${businessSlug}:${clientIp}`, {
    windowMs: 60 * 1000,
    maxRequests: 60,
  });

  if (!limiter.success) {
    logger.warn("[BookingAvailability] Rate limited", {
      businessSlug,
      kind,
      clientIp,
    });
    throw new Error("Too many availability requests. Please try again shortly.");
  }
}

async function getBusinessIdBySlug(businessSlug: string) {
  const business = await getCachedBusinessBySlug(businessSlug);
  return business?.id;
}

export async function getAvailableSlots({
  businessSlug,
  date,
  services,
  slotIntervalMinutes,
}: GetAvailableSlotsParams): Promise<TimeSlot[]> {
  const startedAt = Date.now();
  await applyAvailabilityRateLimit(businessSlug, "slots");
  try {
    const slots = await computeSlots({
      businessSlug,
      date,
      services,
      slotIntervalMinutes,
    });

    const businessId = await getBusinessIdBySlug(businessSlug);
    if (businessId) {
      await recordBookingMetric({
        businessId,
        action: "BOOKING_SLOT_LOOKUP",
        outcome: "SUCCESS",
        metadata: {
          capacityModel: "WORKLOAD_V1",
          slotsReturned: slots.length,
          hasCapacity: slots.length > 0,
          latencyMs: Date.now() - startedAt,
        },
      });
    }
    logger.info("[BookingAvailability] Slot lookup completed", {
      businessSlug,
      slotsReturned: slots.length,
      latencyMs: Date.now() - startedAt,
    });
    return slots;
  } catch (error) {
    const businessId = await getBusinessIdBySlug(businessSlug);
    if (businessId) {
      await recordBookingMetric({
        businessId,
        action: "BOOKING_SLOT_LOOKUP",
        outcome: "FAILED",
        reason: error instanceof Error ? error.message : "UNKNOWN",
        metadata: {
          latencyMs: Date.now() - startedAt,
        },
      });
    }
    logger.warn("[BookingAvailability] Slot lookup failed", {
      businessSlug,
      latencyMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Returns slot counts per date for the booking horizon ahead, so the
 * customer-facing DatePicker can pre-color days by capacity (gray
 * dead-clicks, density dots for low/med/high availability).
 *
 * Implementation: 14× computeSlots() runs in parallel and returns just
 * the count per date — no full slot lists, no rate-limit pressure beyond
 * a single bucket entry. Client caches with `staleTime: 60_000`, so this
 * runs at most ~once/minute per `(slug, services)` pair per user.
 */
export async function getDayCapacityRange({
  businessSlug,
  services,
  fromDate,
  toDate,
}: {
  businessSlug: string;
  services: SelectedServiceInput[];
  fromDate: Date;
  toDate: Date;
}): Promise<Record<string, number>> {
  await applyAvailabilityRateLimit(businessSlug, "day-capacity");

  // Clamp to the booking horizon so a malicious client can't ask for
  // a 10-year range and DOS the worker.
  const policy = await getBookingPolicyByBusinessSlug(prisma, businessSlug);
  const horizonStart = getPHDayBounds(fromDate).dayStart;
  const horizonEnd = new Date(
    horizonStart.getTime() + policy.bookingHorizonDays * 86400000,
  );
  const effectiveEnd =
    toDate.getTime() < horizonEnd.getTime() ? toDate : horizonEnd;

  const dates: Date[] = [];
  for (
    let cursor = new Date(horizonStart);
    cursor.getTime() < effectiveEnd.getTime();
    cursor = new Date(cursor.getTime() + 86400000)
  ) {
    dates.push(new Date(cursor));
  }

  const startedAt = Date.now();
  const counts = await Promise.all(
    dates.map(async (date) => {
      try {
        const slots = await computeSlots({
          businessSlug,
          date,
          services,
          slotIntervalMinutes: policy.slotIntervalMinutes,
        });
        return [toPHDateString(date), slots.length] as const;
      } catch {
        // Don't fail the whole range if one day errors — return 0
        // so that day renders as "no capacity" rather than throwing.
        return [toPHDateString(date), 0] as const;
      }
    }),
  );

  logger.info("[BookingAvailability] Day-capacity range completed", {
    businessSlug,
    dayCount: counts.length,
    latencyMs: Date.now() - startedAt,
  });

  return Object.fromEntries(counts);
}

export async function getAlternativeSlots({
  businessSlug,
  scheduledAt,
  services,
  limit = 6,
}: {
  businessSlug: string;
  scheduledAt: Date;
  services: SelectedServiceInput[];
  limit?: number;
}) {
  const startedAt = Date.now();
  await applyAvailabilityRateLimit(businessSlug, "alternatives");
  const alternatives = await listAlternativeSlots({
    businessSlug,
    scheduledAt,
    services,
    limit,
  });
  logger.info("[BookingAvailability] Alternative slot lookup completed", {
    businessSlug,
    alternativesReturned: alternatives.length,
    latencyMs: Date.now() - startedAt,
  });
  return alternatives;
}

export async function getAvailableProviders({
  businessSlug,
  startTime,
  endTime,
  category = "GENERAL",
  categories,
}: {
  businessSlug: string;
  startTime: Date;
  endTime: Date;
  category?: string;
  categories?: string[];
}) {
  await applyAvailabilityRateLimit(businessSlug, "providers");

  const business = await getCachedBusinessWithHoursAndEmployees(businessSlug);
  if (!business) {
    throw new Error("Business not found");
  }

  const policy = await getBookingPolicyByBusinessSlug(prisma, businessSlug);
  const dayDiff =
    (getPHDayBounds(startTime).dayStart.getTime() -
      getPHDayBounds(new Date()).dayStart.getTime()) /
    86400000;

  if (dayDiff < 0 || dayDiff >= policy.bookingHorizonDays) {
    return [];
  }
  if (!policy.bookingV2Enabled && dayDiff > 0) {
    return [];
  }

  const overlappingBookings = await prisma.booking.findMany({
    where: {
      business_id: business.id,
      scheduled_at: { lte: endTime },
      estimated_end: { gte: startTime },
      status: {
        not: "CANCELLED",
      },
    },
    include: {
      availed_services: true,
    },
  });

  const busyEmployeeIds = new Set<number>();
  for (const booking of overlappingBookings) {
    for (const service of booking.availed_services) {
      if (service.status === "CANCELLED") {
        continue;
      }
      if (service.served_by_id) {
        busyEmployeeIds.add(service.served_by_id);
      }
    }
  }

  const normalizedCategories =
    categories && categories.length > 0
      ? categories.map((c) => c.toLowerCase())
      : [category.toLowerCase()];

  const qualifiedEmployees = business.employees.filter((employee) => {
    if (!isBookingServiceEmployee(employee)) {
      return false;
    }
    if (employee.specialties.length === 0) {
      return true;
    }
    const normalizedSpecialties = employee.specialties.map((specialty) =>
      specialty.toLowerCase(),
    );
    return normalizedCategories.every((serviceCategory) =>
      normalizedSpecialties.includes(serviceCategory),
    );
  });

  if (qualifiedEmployees.length === 0) {
    return [];
  }

  const availableQualifiedEmployees = qualifiedEmployees.filter(
    (employee) => !busyEmployeeIds.has(employee.id),
  );
  if (availableQualifiedEmployees.length === 0) {
    return [];
  }

  return qualifiedEmployees.map((employee) => ({
    id: employee.id,
    name: employee.user.name,
    available: !busyEmployeeIds.has(employee.id),
    specialties: employee.specialties,
    type: "EMPLOYEE" as const,
  }));
}

export async function checkCategoryAvailability({
  businessSlug,
  category = "GENERAL",
  date,
}: {
  businessSlug: string;
  category?: string;
  date?: Date;
}): Promise<{
  hasBusinessHours: boolean;
  businessHoursPassed: boolean;
  qualifiedEmployeeCount: number;
  qualifiedOwnerCount: number;
  qualifiedProviderCount: number;
  businessHours?: { open_time: string; close_time: string; is_closed: boolean };
}> {
  const business = await getCachedBusinessWithHoursAndEmployees(businessSlug);
  if (!business) {
    throw new Error("Business not found");
  }

  const checkDate = date || new Date();
  const dayOfWeek = checkDate.getDay();
  const normalizedCategory = category.toLowerCase();
  const dateStr = toPHDateString(checkDate);
  const now = new Date();
  const nowStr = toPHDateString(now);
  const nowParts = getPHDateComponents(now);
  const phNowDate = new Date(
    `${nowStr}T${nowParts.hour}:${nowParts.minute}:${nowParts.second}+08:00`,
  );
  const isToday = dateStr === nowStr;

  let businessHours = business.business_hours.find(
    (h) =>
      h.day_of_week === dayOfWeek && h.category.toLowerCase() === normalizedCategory,
  );

  if (!businessHours) {
    businessHours = business.business_hours.find(
      (h) => h.day_of_week === dayOfWeek && h.category.toLowerCase() === "general",
    );
  }

  const hasBusinessHours = !!businessHours && !businessHours.is_closed;
  let businessHoursPassed = false;
  if (hasBusinessHours && businessHours && isToday) {
    const windows = buildWindowsForHours({
      dateStr,
      openTime: businessHours.open_time,
      closeTime: businessHours.close_time,
    });
    businessHoursPassed = !windows.some(
      (window) => phNowDate >= window.start && phNowDate < window.end,
    );
  }

  const qualifiedEmployees = business.employees.filter(
    (employee) =>
      isBookingServiceEmployee(employee) &&
      (employee.specialties.length === 0 ||
        employee.specialties.some((specialty) => specialty.toLowerCase() === normalizedCategory)),
  );
  const qualifiedOwners = business.owners.filter((owner) =>
    owner.specialties.some(
      (specialty) => specialty.toLowerCase() === normalizedCategory,
    ),
  );

  return {
    hasBusinessHours,
    businessHoursPassed,
    qualifiedEmployeeCount: qualifiedEmployees.length,
    qualifiedOwnerCount: qualifiedOwners.length,
    qualifiedProviderCount: qualifiedEmployees.length + qualifiedOwners.length,
    businessHours: businessHours
      ? {
          open_time: businessHours.open_time,
          close_time: businessHours.close_time,
          is_closed: businessHours.is_closed,
        }
      : undefined,
  };
}

export async function getBusinessHours(businessSlug: string) {
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    include: {
      business_hours: {
        orderBy: { day_of_week: "asc" },
      },
    },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  return business.business_hours;
}
