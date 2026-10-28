import "server-only";
import { ownerQueueMembership as membership, ownerQueueServiceScope as tenantScope, type OwnerQueueContext as OwnerContext } from "@/features/dashboard/owner-queue-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { logAudit } from "@/lib/services/audit";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { getApplicableDiscount } from "@/lib/utils/pricing";
import { listActiveSaleEventsForTenant } from "@/features/catalog/queries/sale-event-administration";
import { findAvailedServiceScheduleConflict, isAvailedServiceOverlapViolation, scheduleConflictResult } from "@/features/bookings/services/availed-service-overlap";

const failure = (error: string) => ({ success: false as const, error });
class ClaimConflict extends Error {}
const targetSelect = {
  id: true, booking_id: true, service_id: true, package_id: true, price: true,
  status: true, served_by_id: true, served_by_owner_id: true, served_by_type: true,
  claimed_at: true, served_at: true, completed_at: true, cancelled_at: true, paid_in_payslip_id: true,
  scheduled_at: true, estimated_end: true, final_price: true, discount: true, discount_reason: true, commission_base: true,
  booking: { select: { status: true, cancelled_at: true } },
} as const satisfies Prisma.AvailedServiceSelect;
async function recoverOverlap(context: OwnerContext, serviceId: number) {
  try {
    return await prisma.$transaction(async tx => {
      if (!await tx.owner.findFirst({ where: membership(context), select: { id: true } })) return scheduleConflictResult();
      const conflict = await findAvailedServiceScheduleConflict({ businessSlug: context.businessSlug, serviceId, providerType: "OWNER", providerId: context.ownerId }, tx, tenantScope(context));
      return scheduleConflictResult(conflict);
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  } catch { return scheduleConflictResult(); }
}
async function changeOwnerClaim(context: OwnerContext, serviceId: number, claim: boolean) {
  if (context.actorType !== "OWNER") return failure("Unauthorized");
  const raceError = claim ? "Service already claimed or not found." : "Unable to unclaim service.";
  try {
    return await prisma.$transaction(async tx => {
      if (!await tx.owner.findFirst({ where: membership(context), select: { id: true } })) return failure("Owner not found");
      const scope = tenantScope(context);
      const target = await tx.availedService.findFirst({ where: { id: serviceId, ...scope }, select: targetSelect });
      if (!target) return failure("Service not found.");
      if (target.booking.status !== "ACCEPTED" || target.booking.cancelled_at || target.completed_at || target.cancelled_at || target.paid_in_payslip_id !== null) return failure(raceError);
      if (claim) {
        if (target.status !== "PENDING" || target.served_by_owner_id !== null || target.served_by_id !== null || target.served_by_type !== null || target.claimed_at || target.served_at) return failure(raceError);
        const conflict = await findAvailedServiceScheduleConflict({ businessSlug: context.businessSlug, serviceId, providerType: "OWNER", providerId: context.ownerId }, tx, scope);
        if (conflict) return scheduleConflictResult(conflict);
      } else if (!["CLAIMED", "SERVING"].includes(target.status) || target.served_by_owner_id !== context.ownerId || target.served_by_id !== null || target.served_by_type !== "OWNER") return failure(raceError);
      const discount = claim ? getApplicableDiscount(target.service_id, target.package_id ?? undefined, target.price, await listActiveSaleEventsForTenant(context.businessId, tx)) : null;
      const data = {
        status: claim ? "CLAIMED" as const : "PENDING" as const,
        served_by_owner_id: claim ? context.ownerId : null, served_by_id: null,
        served_by_type: claim ? "OWNER" as const : null,
        claimed_at: claim ? getCurrentDateTimePH() : null, served_at: null,
        final_price: discount ? discount.finalPrice : target.price,
        discount: discount ? discount.discount : 0, discount_reason: discount ? discount.reason : null,
        commission_base: discount ? discount.finalPrice : target.price,
      };
      const updated = await tx.availedService.updateMany({
        where: { ...scope, id: target.id, booking_id: target.booking_id, service_id: target.service_id, package_id: target.package_id,
          price: target.price, status: target.status, served_by_id: target.served_by_id, served_by_owner_id: target.served_by_owner_id,
          served_by_type: target.served_by_type, claimed_at: target.claimed_at, served_at: target.served_at,
          completed_at: null, cancelled_at: null, paid_in_payslip_id: null, scheduled_at: target.scheduled_at, estimated_end: target.estimated_end,
          final_price: target.final_price, discount: target.discount, discount_reason: target.discount_reason, commission_base: target.commission_base,
          AND: [{ booking: { status: "ACCEPTED", cancelled_at: null } }],
        }, data,
      });
      if (updated.count !== 1) throw new ClaimConflict();
      const { booking: _booking, ...before } = target;
      await logAudit(tx, { entityType: "AvailedService", entityId: String(target.id), action: "STATUS_CHANGED", actorId: context.userId, businessId: context.businessId, changes: { before, after: { ...data, mode: claim ? "OWNER_QUEUE_CLAIM" : "OWNER_QUEUE_UNCLAIM" } } });
      return { success: true as const };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (error instanceof ClaimConflict || code === "P2025" || code === "P2034") return failure(raceError);
    if (claim && isAvailedServiceOverlapViolation(error)) return recoverOverlap(context, serviceId);
    return failure(claim ? "Unable to claim service." : "Unable to unclaim service.");
  }
}
export function claimOwnerService(context: OwnerContext, serviceId: number) {
  return changeOwnerClaim(context, serviceId, true);
}
export function unclaimOwnerService(context: OwnerContext, serviceId: number) {
  return changeOwnerClaim(context, serviceId, false);
}
