import "server-only";

import { computeSlots } from "@/features/bookings/services/booking-availability";
import { prisma } from "@/prisma/prisma";
import type {
  AssistantAvailability,
  AssistantPublicFacts,
  AssistantTenant,
} from "@/features/social/conversation-assistant/types";

const MAX_PUBLIC_SERVICES = 100;
const MAX_PUBLIC_HOURS = 100;
const MAX_AVAILABILITY_DAYS = 14;

export class AssistantFactsError extends Error {
  constructor() {
    super("The assistant cannot use these business facts.");
  }
}

export async function getAssistantPublicFacts(
  tenant: AssistantTenant,
  now = new Date(),
): Promise<AssistantPublicFacts> {
  const [business, services, hours] = await Promise.all([
    prisma.business.findFirst({
      where: { id: tenant.businessId, slug: tenant.businessSlug },
      select: { name: true, timezone: true },
    }),
    prisma.service.findMany({
      where: { business_id: tenant.businessId },
      select: { id: true, name: true, category: true, price: true, duration: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: MAX_PUBLIC_SERVICES + 1,
    }),
    prisma.businessHours.findMany({
      where: { business_id: tenant.businessId },
      select: { day_of_week: true, category: true, open_time: true, close_time: true, is_closed: true },
      orderBy: [{ day_of_week: "asc" }, { category: "asc" }],
      take: MAX_PUBLIC_HOURS + 1,
    }),
  ]);

  if (!business || business.timezone !== "Asia/Manila" ||
      services.length > MAX_PUBLIC_SERVICES || hours.length > MAX_PUBLIC_HOURS) {
    throw new AssistantFactsError();
  }

  return {
    businessId: tenant.businessId,
    businessSlug: tenant.businessSlug,
    name: business.name,
    timezone: "Asia/Manila",
    generatedAt: now.toISOString(),
    services: services.map((service) => ({
      id: service.id, name: service.name, category: service.category, price: service.price,
      durationMinutes: service.duration !== null && service.duration > 0 ? service.duration : null,
    })),
    hours: hours.map((hoursRow) => ({
      dayOfWeek: hoursRow.day_of_week, category: hoursRow.category,
      openTime: hoursRow.open_time, closeTime: hoursRow.close_time, isClosed: hoursRow.is_closed,
    })),
  };
}

export function isAssistantAvailabilityDate(date: string, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const requested = new Date(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(requested.getTime())) return false;
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  });
  if (format.format(requested) !== date) return false;
  const today = new Date(`${format.format(now)}T00:00:00+08:00`);
  const days = (requested.getTime() - today.getTime()) / 86_400_000;
  return days >= 0 && days < MAX_AVAILABILITY_DAYS;
}

export async function getAssistantAvailability(
  tenant: AssistantTenant,
  serviceId: number,
  date: string,
  now = new Date(),
): Promise<AssistantAvailability> {
  if (!Number.isInteger(serviceId) || serviceId <= 0 || serviceId > 2_147_483_647 ||
      !isAssistantAvailabilityDate(date, now)) throw new AssistantFactsError();

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.findFirst({
      where: { id: tenant.businessId, slug: tenant.businessSlug },
      select: { id: true, timezone: true },
    });
    if (!business || business.timezone !== "Asia/Manila") throw new AssistantFactsError();
    // The existing engine drops unknown IDs. Reject foreign/deleted IDs first.
    const service = await tx.service.findFirst({
      where: { id: serviceId, business_id: tenant.businessId },
      select: { id: true },
    });
    if (!service) throw new AssistantFactsError();

    const slots = await computeSlots({
      businessSlug: tenant.businessSlug,
      date: new Date(`${date}T12:00:00+08:00`),
      services: [{ id: service.id, quantity: 1 }],
      db: tx,
    });
    return {
      businessId: tenant.businessId, serviceId: service.id, date,
      checkedAt: new Date().toISOString(),
      slots: slots.filter((slot) => slot.available).slice(0, 10).map((slot) => ({
        startTime: slot.startTime.toISOString(), endTime: slot.endTime.toISOString(),
      })),
    };
  }, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 10_000 });
}
