import "server-only";
import { prisma } from "@/prisma/prisma";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { logAudit } from "@/lib/services/audit";
import { promoteBookingToCompletedIfEligible } from "@/lib/services/booking-status";
import { ownerQueueMembership, ownerQueueBookingScope, ownerQueueServiceScope, type OwnerQueueContext } from "@/features/dashboard/owner-queue-access";
import { ownerServiceSelect } from "@/features/dashboard/owner-service-select";

const failure = (error: string) => ({ success: false as const, error });

async function changeOwnerServing(context: OwnerQueueContext, serviceId: number, serve: boolean) {
  if (context.actorType !== "OWNER") return failure("Unauthorized");
  const error = serve ? "Unable to mark as served." : "Unable to unserve.";
  try {
    return await prisma.$transaction(async tx => {
      if (!await tx.owner.findFirst({ where: ownerQueueMembership(context), select: { id: true } })) return failure("Owner not found");
      const scope = ownerQueueServiceScope(context);
      const target = await tx.availedService.findFirst({
        where: { id: serviceId, ...scope },
        select: { ...ownerServiceSelect, booking: { select: { status: true, cancelled_at: true, customer_id: true } } },
      });
      if (!target) return failure(error);
      if (target.served_by_owner_id !== context.ownerId || target.served_by_id !== null || target.served_by_type !== "OWNER" || target.cancelled_at || target.booking.cancelled_at || target.paid_in_payslip_id !== null) return failure(error);
      if (serve
        ? target.booking.status !== "ACCEPTED" || !["CLAIMED", "SERVING"].includes(target.status) || target.completed_at !== null
        : !["ACCEPTED", "COMPLETED"].includes(target.booking.status) || target.status !== "COMPLETED" || target.completed_at === null) return failure(error);

      const parentScope = { ...ownerQueueBookingScope(context), status: target.booking.status, cancelled_at: null, customer_id: target.booking.customer_id };
      const now = serve ? getCurrentDateTimePH() : null;
      const data = { status: serve ? "COMPLETED" as const : "CLAIMED" as const, served_at: now, completed_at: now };
      const changed = await tx.availedService.updateMany({
        where: { ...scope, id: target.id, booking_id: target.booking_id, service_id: target.service_id, package_id: target.package_id,
          status: target.status, served_by_owner_id: context.ownerId, served_by_id: null, served_by_type: "OWNER",
          claimed_at: target.claimed_at, served_at: target.served_at, completed_at: target.completed_at,
          cancelled_at: null, paid_in_payslip_id: null, updated_at: target.updated_at,
          AND: [{ booking: parentScope }],
        }, data,
      });
      if (changed.count !== 1) throw new Error("Service snapshot changed");
      let parentChanged = false;
      if (serve) {
        parentChanged = await promoteBookingToCompletedIfEligible(tx, target.booking_id, { businessId: context.businessId, booking: parentScope });
      } else if (target.booking.status === "COMPLETED") {
        const reopened = await tx.booking.updateMany({ where: { id: target.booking_id, ...parentScope }, data: { status: "ACCEPTED" } });
        if (reopened.count !== 1) throw new Error("Booking snapshot changed");
        parentChanged = true;
      }
      const mode = serve ? "OWNER_QUEUE_SERVE" : "OWNER_QUEUE_UNDO_SERVE";
      const actor = { actorId: context.userId, businessId: context.businessId };
      await logAudit(tx, { ...actor, entityType: "AvailedService", entityId: String(target.id), action: "STATUS_CHANGED", changes: { before: { status: target.status, served_at: target.served_at, completed_at: target.completed_at, served_by_owner_id: target.served_by_owner_id }, after: { ...data, mode } } });
      if (parentChanged) await logAudit(tx, { ...actor, entityType: "Booking", entityId: String(target.booking_id), action: "STATUS_CHANGED", changes: { before: { status: target.booking.status }, after: { status: serve ? "COMPLETED" : "ACCEPTED", mode } } });
      const updated = await tx.availedService.findFirst({ where: { id: target.id, booking_id: target.booking_id, ...scope, served_by_owner_id: context.ownerId, served_by_id: null, served_by_type: "OWNER", status: data.status }, select: ownerServiceSelect });
      if (!updated) throw new Error("Updated service not found");
      return { success: true as const, data: updated };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  } catch { return failure(error); }
}

export function serveOwnerService(context: OwnerQueueContext, serviceId: number) {
  return changeOwnerServing(context, serviceId, true);
}

export function undoOwnerServiceServing(context: OwnerQueueContext, serviceId: number) {
  return changeOwnerServing(context, serviceId, false);
}
