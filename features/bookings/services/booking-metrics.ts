import { getCurrentDateTimePH } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/prisma/prisma";
import type { Prisma, PrismaClient } from "@/prisma/generated/prisma/client";

type AuditDbClient = PrismaClient | Prisma.TransactionClient;

export type BookingMetricAction =
  | "BOOKING_SLOT_LOOKUP"
  | "BOOKING_SUBMIT_ATTEMPT"
  | "BOOKING_SUBMIT_SUCCESS"
  | "BOOKING_SUBMIT_REJECTION"
  | "PUBLIC_BOOKING_STARTED"
  | "PUBLIC_BOOKING_COMPLETED";

export type BookingMetricOutcome =
  | "SUCCESS"
  | "FAILED"
  | "REJECTED"
  | "STARTED"
  | "COMPLETED";

export async function recordBookingMetric({
  businessId,
  action,
  outcome,
  reason,
  metadata,
  entityId,
  actorId,
  actorType = "SYSTEM",
  db = prisma,
}: {
  businessId: string;
  action: BookingMetricAction;
  outcome: BookingMetricOutcome;
  reason?: string;
  metadata?: Record<string, unknown>;
  entityId?: string;
  actorId?: string | null;
  actorType?: "USER" | "SYSTEM" | "WEBHOOK";
  db?: AuditDbClient;
}) {
  try {
    await db.auditLog.create({
      data: {
        entity_type: "BookingMetric",
        entity_id: entityId || action,
        action,
        actor_id: actorId || null,
        actor_type: actorType,
        business_id: businessId,
        changes: {
          outcome,
          reason: reason || null,
          ...(metadata || {}),
        },
        created_at: getCurrentDateTimePH(),
      },
    });
  } catch (error) {
    logger.warn("[BookingMetrics] Failed to record metric", {
      businessId,
      action,
      outcome,
      reason: reason || null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
