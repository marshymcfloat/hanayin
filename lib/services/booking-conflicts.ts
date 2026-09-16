import { getCurrentDateTimePH, getStartOfDayPH } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/prisma/prisma";
import type { Prisma, PrismaClient } from "@/prisma/generated/prisma/client";
import { computeSlots } from "@/features/bookings/services/booking-availability";
import { getBookingPolicyByBusinessId } from "./booking-policy";

type ConflictDbClient = PrismaClient | Prisma.TransactionClient;

const CONFLICT_EVENT_TYPE = "BOOKING_STAFFING_CONFLICT_DETECTED";

type ConflictTrigger =
  | "BUSINESS_HOURS_UPDATED"
  | "ATTENDANCE_UPDATED"
  | "EMPLOYEE_SPECIALTIES_UPDATED"
  | "OWNER_SPECIALTIES_UPDATED"
  | "LEAVE_APPROVED"
  | "MANUAL_REVALIDATION";

async function getBusinessContext(
  db: ConflictDbClient,
  params: { businessId?: string; businessSlug?: string },
) {
  if (params.businessId) {
    return db.business.findUnique({
      where: { id: params.businessId },
      select: { id: true, slug: true, name: true },
    });
  }

  if (params.businessSlug) {
    return db.business.findUnique({
      where: { slug: params.businessSlug },
      select: { id: true, slug: true, name: true },
    });
  }

  return null;
}

export async function detectAndEmitFutureBookingConflicts({
  businessId,
  businessSlug,
  changedDate,
  trigger,
  maxBookingsToScan = 120,
  db = prisma,
}: {
  businessId?: string;
  businessSlug?: string;
  changedDate?: Date;
  trigger: ConflictTrigger;
  maxBookingsToScan?: number;
  db?: ConflictDbClient;
}) {
  const business = await getBusinessContext(db, { businessId, businessSlug });
  if (!business) {
    throw new Error("Business not found");
  }

  const policy = await getBookingPolicyByBusinessId(db, business.id);
  const now = getCurrentDateTimePH();
  const todayStart = getStartOfDayPH(now);
  const horizonEnd = new Date(
    todayStart.getTime() + policy.bookingHorizonDays * 24 * 60 * 60 * 1000,
  );
  const startAt = changedDate
    ? new Date(Math.max(getStartOfDayPH(changedDate).getTime(), now.getTime()))
    : now;

  const futureAcceptedBookings = await db.booking.findMany({
    where: {
      business_id: business.id,
      status: "ACCEPTED",
      scheduled_at: {
        gte: startAt,
        lt: horizonEnd,
      },
    },
    select: {
      id: true,
      scheduled_at: true,
      customer: {
        select: {
          name: true,
        },
      },
      availed_services: {
        where: {
          status: {
            not: "CANCELLED",
          },
        },
        select: {
          service_id: true,
        },
      },
    },
    orderBy: {
      scheduled_at: "asc",
    },
    take: Math.max(1, maxBookingsToScan),
  });

  if (futureAcceptedBookings.length === 0) {
    return { scanned: 0, conflicts: 0 };
  }

  const existingSignals = await db.outboxMessage.findMany({
    where: {
      business_id: business.id,
      event_type: CONFLICT_EVENT_TYPE,
      created_at: {
        gte: getStartOfDayPH(now),
      },
    },
    select: {
      aggregate_id: true,
    },
  });
  const alreadySignaledIds = new Set(
    existingSignals.map((entry) => entry.aggregate_id),
  );

  let conflictCount = 0;

  for (const booking of futureAcceptedBookings) {
    if (alreadySignaledIds.has(String(booking.id))) {
      continue;
    }
    const scheduledAt = booking.scheduled_at;
    if (!scheduledAt) {
      continue;
    }

    const serviceQuantities = new Map<number, number>();
    for (const availed of booking.availed_services) {
      serviceQuantities.set(
        availed.service_id,
        (serviceQuantities.get(availed.service_id) || 0) + 1,
      );
    }

    const serviceInputs = Array.from(serviceQuantities.entries()).map(
      ([id, quantity]) => ({
        id,
        quantity,
      }),
    );

    if (serviceInputs.length === 0) {
      continue;
    }

    const slots = await computeSlots({
      businessSlug: business.slug,
      date: scheduledAt,
      services: serviceInputs,
      now,
      db,
    });

    const slotStillAvailable = slots.some(
      (slot) => slot.startTime.getTime() === scheduledAt.getTime(),
    );

    if (slotStillAvailable) {
      continue;
    }

    await db.outboxMessage.create({
      data: {
        event_type: CONFLICT_EVENT_TYPE,
        aggregate_type: "Booking",
        aggregate_id: String(booking.id),
        business_id: business.id,
        payload: {
          bookingId: booking.id,
          scheduledAt: scheduledAt.toISOString(),
          customerName: booking.customer?.name || null,
          trigger,
          reason:
            "Future booking no longer matches currently available staffing/capacity.",
          detectedAt: now.toISOString(),
        },
      },
    });

    conflictCount += 1;
    alreadySignaledIds.add(String(booking.id));
  }

  logger.info("[BookingConflicts] Revalidation complete", {
    businessId: business.id,
    businessSlug: business.slug,
    trigger,
    scanned: futureAcceptedBookings.length,
    conflicts: conflictCount,
  });

  return {
    scanned: futureAcceptedBookings.length,
    conflicts: conflictCount,
  };
}
