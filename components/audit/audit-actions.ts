"use server";

/**
 * Server action wrapping {@link getAuditHistory} from `lib/services/audit.ts`
 * with a tenant-scoping guard.
 *
 * Permission rule (per `docs/role-permissions-matrix.md` §3 and §4):
 *   - OWNER     → always allowed
 *   - MANAGER   → allowed (audit visibility for the team they manage)
 *   - CASHIER   → not allowed
 *   - STAFF     → not allowed
 *
 * Tenant scoping is enforced by always filtering on the actor's
 * business_id, regardless of what the caller passes — entries from
 * other tenants are never returned even if the entity_id collides.
 */

import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { StaffProfile } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export type AuditEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actorType: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditHistoryResult =
  | { success: true; entries: AuditEntry[] }
  | { success: false; error: string };

export async function getEntityAuditHistoryAction(
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<AuditHistoryResult> {
  if (!entityType || !entityId) {
    return { success: false, error: "Invalid input" };
  }
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);

  const auth = await requireAuth();
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const context = await resolveTenantActorContext(
    auth.businessSlug,
    auth.session.user.id,
  );
  if (!context.success) {
    return { success: false, error: context.error };
  }

  const isOwner = context.actorType === "OWNER";
  const isManager =
    context.actorType === "EMPLOYEE" &&
    context.profile === StaffProfile.MANAGER;
  if (!isOwner && !isManager) {
    return { success: false, error: "Forbidden" };
  }

  const rows = await prisma.auditLog.findMany({
    where: {
      entity_type: entityType,
      entity_id: entityId,
      business_id: context.businessId,
    },
    orderBy: { created_at: "desc" },
    take: safeLimit,
  });

  return {
    success: true,
    entries: rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      actorId: row.actor_id,
      actorType: row.actor_type,
      // Cast Json to a plain shape; downstream renders defensively.
      changes: (row.changes as Record<string, unknown> | null) ?? null,
      createdAt: row.created_at.toISOString(),
    })),
  };
}
