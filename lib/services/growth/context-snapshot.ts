import { getCurrentDateTimePH, getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import {
  buildAcademicSeasonSignals,
  fetchLocalityForCoordinates,
  fetchWeatherSnapshotForCoordinates,
} from "@/lib/services/growth/location-intelligence";
import type { GrowthContextPayload } from "@/lib/services/growth/types";
import { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const MANILA_TIMEZONE = "Asia/Manila";

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getPHDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getPHDayOfWeek(date: Date) {
  const dateKey = getPHDateKey(date);
  return new Date(`${dateKey}T00:00:00+08:00`).getUTCDay();
}

function parseTimeStringToMinutes(value: string) {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number.parseInt(hourRaw || "0", 10);
  const minute = Number.parseInt(minuteRaw || "0", 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function minutesBetween(open: string, close: string) {
  const start = parseTimeStringToMinutes(open);
  const end = parseTimeStringToMinutes(close);
  if (start === end) return 24 * 60;
  if (end > start) return end - start;
  return 24 * 60 - start + end;
}

function toBusinessTypeFromCategories(categories: string[]) {
  const normalized = categories.map((value) => value.toLowerCase());
  if (normalized.some((value) => value.includes("barber"))) return "BARBERSHOP";
  if (normalized.some((value) => value.includes("clinic"))) return "CLINIC";
  if (normalized.some((value) => value.includes("spa"))) return "SPA";
  return "SALON";
}

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizeSignalPart(value: string) {
  return value.replaceAll(":", "-").trim();
}

function normalizeToken(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim();
}

function readStringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function buildLocalityTokens(locality: {
  city: string | null;
  province: string | null;
  region: string | null;
}) {
  return [locality.city, locality.province, locality.region]
    .map((value) => normalizeToken(value))
    .filter((value) => value.length > 0);
}

function eventLooksLocal(input: {
  eventType: string;
  eventName: string;
  metadata: Record<string, unknown> | null;
  locality: { city: string | null; province: string | null; region: string | null } | null;
}) {
  const eventType = input.eventType.toUpperCase();
  if (eventType.includes("LOCAL")) return true;

  const metadata = input.metadata;
  if (!metadata || !input.locality) return false;

  const scope = normalizeToken(readStringField(metadata, ["scope", "coverage", "level"]));
  if (scope.includes("national")) return false;

  const metadataLocationParts = [
    readStringField(metadata, ["city", "municipality", "town"]),
    readStringField(metadata, ["province", "state"]),
    readStringField(metadata, ["region"]),
    readStringField(metadata, ["barangay", "district"]),
  ]
    .map((value) => normalizeToken(value))
    .filter((value) => value.length > 0);

  if (metadataLocationParts.length === 0) return false;

  const localityTokens = buildLocalityTokens(input.locality);
  if (localityTokens.length === 0) return false;

  return metadataLocationParts.some((part) =>
    localityTokens.some((localToken) => part.includes(localToken) || localToken.includes(part)),
  ) || metadataLocationParts.some((part) => normalizeToken(input.eventName).includes(part));
}

export async function ensureBusinessGrowthSettings(businessId: string) {
  const existing = await prisma.businessGrowthSettings.findUnique({
    where: { business_id: businessId },
  });
  if (existing) {
    return existing;
  }

  const categories = await prisma.service.findMany({
    where: { business_id: businessId },
    select: { category: true },
    take: 50,
  });

  return prisma.businessGrowthSettings.create({
    data: {
      business_id: businessId,
      business_type: toBusinessTypeFromCategories(categories.map((entry) => entry.category)),
    },
  });
}

export async function getLatestGrowthContextSnapshot(businessId: string) {
  return prisma.growthContextSnapshot.findFirst({
    where: { business_id: businessId },
    orderBy: { created_at: "desc" },
  });
}

export async function refreshGrowthContextSnapshot(businessSlug: string) {
  const nowPH = getCurrentDateTimePH();
  const startOfToday = getStartOfDayPH(nowPH);
  const endOfCapacityRange = getEndOfDayPH(
    new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000),
  );
  const endOfSeasonalityRange = getEndOfDayPH(
    new Date(startOfToday.getTime() + 45 * 24 * 60 * 60 * 1000),
  );

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    include: {
      services: { select: { id: true, duration: true, price: true, category: true } },
      packages: { select: { id: true } },
      employees: { select: { id: true } },
      owners: { select: { id: true } },
      business_hours: true,
    },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  const settings = await ensureBusinessGrowthSettings(business.id);

  const bookings = await prisma.booking.findMany({
    where: {
      business_id: business.id,
      status: { not: "CANCELLED" },
      scheduled_at: {
        gte: startOfToday,
        lte: endOfCapacityRange,
      },
    },
    select: {
      id: true,
      scheduled_at: true,
    },
  });

  const seasonalEvents = await prisma.seasonalCalendar.findMany({
    where: {
      country_code: "PH",
      is_active: true,
      event_date: {
        gte: startOfToday,
        lte: endOfSeasonalityRange,
      },
    },
    select: {
      event_name: true,
      event_type: true,
      event_date: true,
      metadata: true,
    },
    orderBy: { event_date: "asc" },
  });

  const bookedByDate = new Map<string, number>();
  for (const booking of bookings) {
    if (!booking.scheduled_at) continue;
    const key = getPHDateKey(booking.scheduled_at);
    bookedByDate.set(key, (bookedByDate.get(key) || 0) + 1);
  }

  const averageServiceDurationMinutes = Math.max(
    30,
    Math.round(
      business.services.reduce((sum, service) => sum + (service.duration || 30), 0) /
        Math.max(1, business.services.length),
    ),
  );
  const averageServicePrice = Number(
    (
      business.services.reduce((sum, service) => sum + service.price, 0) /
      Math.max(1, business.services.length)
    ).toFixed(2),
  );
  const providerCount = Math.max(1, business.employees.length + business.owners.length);

  const dailyCapacity = Array.from({ length: 8 }).map((_, dayOffset) => {
    const dayStart = new Date(startOfToday.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dayOfWeek = getPHDayOfWeek(dayStart);
    const dateKey = getPHDateKey(dayStart);
    const dayHours =
      business.business_hours.find(
        (entry) =>
          entry.day_of_week === dayOfWeek && entry.category.toLowerCase() === "general",
      ) ||
      business.business_hours.find((entry) => entry.day_of_week === dayOfWeek) ||
      null;
    const openMinutes = dayHours && !dayHours.is_closed
      ? minutesBetween(dayHours.open_time, dayHours.close_time)
      : 0;
    const estimatedCapacitySlots = Math.max(
      0,
      Math.floor((openMinutes / averageServiceDurationMinutes) * providerCount),
    );
    const bookedSlots = bookedByDate.get(dateKey) || 0;
    return {
      date: dateKey,
      estimatedCapacitySlots,
      bookedSlots,
      openSlots: Math.max(0, estimatedCapacitySlots - bookedSlots),
    };
  });

  const hasCoordinates =
    typeof business.latitude === "number" &&
    Number.isFinite(business.latitude) &&
    typeof business.longitude === "number" &&
    Number.isFinite(business.longitude);
  const coordinates = hasCoordinates
    ? {
        latitude: business.latitude as number,
        longitude: business.longitude as number,
      }
    : null;

  const locality = coordinates
    ? await fetchLocalityForCoordinates(coordinates)
    : null;
  const weatherSnapshot =
    settings.weather_hooks_enabled && coordinates
      ? await fetchWeatherSnapshotForCoordinates(coordinates)
      : null;

  const seasonalSignals = seasonalEvents.map((entry) => {
    const eventType = entry.event_type.toUpperCase();
    const metadata = toObjectRecord(entry.metadata);
    const isLocal = eventLooksLocal({
      eventType,
      eventName: entry.event_name,
      metadata,
      locality,
    });

    let signalType = "SEASONAL";
    if (isLocal) {
      signalType = "LOCAL_EVENT";
    } else if (eventType.includes("FESTIVAL")) {
      signalType = "FESTIVAL";
    } else if (eventType.includes("ACADEMIC")) {
      signalType = "ACADEMIC";
    } else if (eventType.includes("HOLIDAY")) {
      signalType = "HOLIDAY";
    } else if (eventType.includes("PAYDAY")) {
      signalType = "PAYDAY";
    }

    return `${signalType}:${sanitizeSignalPart(entry.event_name)}:${getPHDateKey(entry.event_date)}`;
  });

  const seasonalitySignals = [
    ...new Set([...seasonalSignals, ...buildAcademicSeasonSignals(nowPH)]),
  ];

  const contextPayload: GrowthContextPayload = {
    businessSlug: business.slug,
    businessName: business.name,
    businessType: settings.business_type,
    serviceCount: business.services.length,
    packageCount: business.packages.length,
    providerCount,
    averageServiceDurationMinutes,
    averageServicePrice,
    dailyCapacity,
    weather: {
      enabled: settings.weather_hooks_enabled,
      summary: weatherSnapshot?.summary,
      condition: weatherSnapshot?.condition,
      temperatureC: weatherSnapshot?.temperatureC ?? undefined,
      precipitationProbability:
        weatherSnapshot?.precipitationProbability ?? undefined,
      source: weatherSnapshot?.source,
      observedAt: weatherSnapshot?.observedAt,
      localityName: locality?.displayName,
    },
    seasonalitySignals,
  };

  const snapshot = await prisma.growthContextSnapshot.create({
    data: {
      business_id: business.id,
      snapshot_date: startOfToday,
      window_start: startOfToday,
      window_end: endOfCapacityRange,
      context_json: toInputJson(contextPayload),
      capacity_summary_json: toInputJson({
        providerCount,
        dailyCapacity,
      }),
      demand_summary_json: toInputJson({
        bookingCount: bookings.length,
        bookedByDate: Object.fromEntries(bookedByDate.entries()),
      }),
      weather_summary_json: settings.weather_hooks_enabled
        ? toInputJson(
            weatherSnapshot || {
              status: "unavailable",
              reason: coordinates
                ? "Weather provider unavailable."
                : "Business coordinates missing.",
            },
          )
        : Prisma.JsonNull,
    },
  });

  return { snapshot, settings, contextPayload };
}
