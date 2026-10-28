import "server-only";
import { AvailedServiceStatus } from "@/prisma/generated/prisma/client";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const OVERLAP_CONSTRAINTS = [
  "AvailedService_employee_no_overlap_excl",
  "AvailedService_owner_no_overlap_excl",
] as const;

export type ServiceScheduleConflict = {
  serviceName: string;
  scheduledAt: Date;
};

export function isAvailedServiceOverlapViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && !seen.has(current)) {
    seen.add(current);

    if (current instanceof Error) {
      const message = current.message;
      if (OVERLAP_CONSTRAINTS.some((name) => message.includes(name))) {
        return true;
      }
      current = current.cause;
      continue;
    }

    if (typeof current === "object" && "cause" in current) {
      current = (current as { cause?: unknown }).cause;
      continue;
    }

    break;
  }

  return false;
}

export async function findAvailedServiceScheduleConflict({
  businessSlug,
  serviceId,
  providerType,
  providerId,
}: {
  businessSlug: string;
  serviceId: number;
  providerType: "EMPLOYEE" | "OWNER";
  providerId: number;
}, db: Pick<Prisma.TransactionClient, "availedService"> = prisma, scope?: Prisma.AvailedServiceWhereInput): Promise<ServiceScheduleConflict | null> {
  const target = await db.availedService.findFirst({
    where: {
      id: serviceId,
      booking: { business: { slug: businessSlug } },
      ...(scope ? { AND: [scope] } : {}),
    },
    select: { scheduled_at: true, estimated_end: true },
  });

  if (!target?.scheduled_at || !target.estimated_end) return null;

  const conflict = await db.availedService.findFirst({
    where: {
      id: { not: serviceId },
      booking: { business: { slug: businessSlug } },
      ...(scope ? { AND: [scope] } : {}),
      ...(providerType === "EMPLOYEE"
        ? { served_by_id: providerId }
        : { served_by_owner_id: providerId }),
      status: { not: AvailedServiceStatus.CANCELLED },
      cancelled_at: null,
      scheduled_at: { lt: target.estimated_end },
      estimated_end: { gt: target.scheduled_at },
    },
    orderBy: { scheduled_at: "asc" },
    select: {
      scheduled_at: true,
      service: { select: { name: true } },
    },
  });

  if (!conflict?.scheduled_at) return null;

  return {
    serviceName: conflict.service.name,
    scheduledAt: conflict.scheduled_at,
  };
}

export function scheduleConflictResult(conflict?: ServiceScheduleConflict | null) {
  return {
    success: false as const,
    code: "SCHEDULE_CONFLICT" as const,
    error: "You already have another service scheduled during this time.",
    ...(conflict
      ? {
          conflict: {
            serviceName: conflict.serviceName,
            scheduledAt: conflict.scheduledAt.toISOString(),
          },
        }
      : {}),
  };
}
