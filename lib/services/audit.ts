import { Prisma } from "@/prisma/generated/prisma/client";

export type AuditAction =
  | "CREATED"
  | "UPDATED"
  | "STATUS_CHANGED"
  | "PRICE_MODIFIED"
  | "CANCELLED"
  | "APPROVED"
  | "REJECTED"
  | "ESCALATED"
  | "FOLLOW_UP_RESOLVED"
  | "PAYMENT_RECORDED"
  | "PAYMENT_VOIDED";

export interface AuditParams {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorId?: string;
  actorType?: "USER" | "SYSTEM" | "WEBHOOK";
  businessId: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
}

/**
 * Logs an audit entry within the same transaction.
 * Use this to record important changes for compliance and debugging.
 *
 * @example
 * await prisma.$transaction(async (tx) => {
 *   const oldBooking = await tx.booking.findUnique({ where: { id } });
 *   await tx.booking.update({ where: { id }, data: { status: 'CANCELLED' } });
 *   await logAudit(tx, {
 *     entityType: 'Booking',
 *     entityId: String(id),
 *     action: 'CANCELLED',
 *     actorId: userId,
 *     businessId: booking.business_id,
 *     changes: { before: { status: oldBooking.status }, after: { status: 'CANCELLED' } }
 *   });
 * });
 */
export async function logAudit(
  tx: Prisma.TransactionClient,
  params: AuditParams,
) {
  return tx.auditLog.create({
    data: {
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      actor_id: params.actorId,
      actor_type: params.actorType || "USER",
      business_id: params.businessId,
      changes: params.changes as Prisma.JsonObject | undefined,
    },
  });
}

/**
 * Retrieves audit history for an entity.
 */
export async function getAuditHistory(
  entityType: string,
  entityId: string,
  limit = 50,
) {
  const { prisma } = await import("@/prisma/prisma");
  return prisma.auditLog.findMany({
    where: {
      entity_type: entityType,
      entity_id: entityId,
    },
    orderBy: { created_at: "desc" },
    take: limit,
  });
}
