"use server";

import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { Role, StaffProfile } from "@/prisma/generated/prisma/enums";

import { findEntityAuditPage } from "@/features/platform/audit/repository";
import type {
  AuditEntry,
  AuditHistoryResult,
} from "@/features/platform/audit/types";

export type {
  AuditEntry,
  AuditHistoryResult,
} from "@/features/platform/audit/types";

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
  if (auth.session.user.role === Role.PLATFORM_ADMIN) {
    return { success: false, error: "Forbidden" };
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

  const entries: AuditEntry[] = await findEntityAuditPage({
    businessId: context.businessId,
    entityType,
    entityId,
    limit: safeLimit,
  });

  return { success: true, entries };
}
