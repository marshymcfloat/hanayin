"use server";

// Feature-owned Server Action boundary.

import { prisma } from "@/prisma/prisma";
import { requireTenantWriteAccess } from "@/lib/auth/guards";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";
import { logger } from "@/lib/logger";

export interface BusinessHourInput {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
  category: string;
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

export async function updateBusinessHours(
  businessSlug: string,
  hours: BusinessHourInput[],
) {
  const auth = await requireTenantWriteAccess(businessSlug);
  if (!auth.success) return auth;

  const UPSERT_BATCH_SIZE = 25;

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  // Keep only the latest entry per (day, category) and write in small batches
  // so each transaction remains below the default expiration window.
  const uniqueHours = Array.from(
    new Map(
      hours.map((hour) => [`${hour.day_of_week}:${hour.category}`, hour] as const),
    ).values(),
  );

  for (let i = 0; i < uniqueHours.length; i += UPSERT_BATCH_SIZE) {
    const batch = uniqueHours.slice(i, i + UPSERT_BATCH_SIZE);
    const upsertOperations = batch.map((hour) =>
      prisma.businessHours.upsert({
        where: {
          business_id_day_of_week_category: {
            business_id: business.id,
            day_of_week: hour.day_of_week,
            category: hour.category,
          },
        },
        update: {
          open_time: hour.open_time,
          close_time: hour.close_time,
          is_closed: hour.is_closed,
        },
        create: {
          business_id: business.id,
          day_of_week: hour.day_of_week,
          open_time: hour.open_time,
          close_time: hour.close_time,
          is_closed: hour.is_closed,
          category: hour.category,
        },
      }),
    );

    await prisma.$transaction(upsertOperations);
  }

  try {
    await detectAndEmitFutureBookingConflicts({
      businessId: business.id,
      trigger: "BUSINESS_HOURS_UPDATED",
    });
  } catch (error) {
    logger.warn("[BookingConflicts] Failed after business-hours update", {
      businessId: business.id,
      businessSlug,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { success: true };
}

export async function getServiceCategories(businessSlug: string) {
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    include: {
      services: {
        select: {
          category: true,
        },
        distinct: ["category"],
      },
    },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  return business.services.map((s) => s.category);
}
