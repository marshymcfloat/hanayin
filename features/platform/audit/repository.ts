import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

import type { AuditEntry } from "@/features/platform/audit/types";

const auditEntrySelect = {
  id: true,
  entity_type: true,
  entity_id: true,
  action: true,
  actor_id: true,
  actor_type: true,
  changes: true,
  created_at: true,
} satisfies Prisma.AuditLogSelect;

export type EntityAuditPageQuery = {
  businessId: string;
  entityType: string;
  entityId: string;
  limit: number;
  cursor?: string;
};

export async function findEntityAuditPage(
  query: EntityAuditPageQuery,
): Promise<AuditEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      business_id: query.businessId,
      entity_type: query.entityType,
      entity_id: query.entityId,
    },
    select: auditEntrySelect,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: query.limit,
    ...(query.cursor
      ? {
          cursor: { id: query.cursor },
          skip: 1,
        }
      : {}),
  });

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorId: row.actor_id,
    actorType: row.actor_type,
    changes: (row.changes as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at.toISOString(),
  }));
}
