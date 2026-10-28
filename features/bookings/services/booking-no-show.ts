import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { logAudit } from "@/lib/services/audit";
import { recheckBookingNoShowAccess, type BookingNoShowActor } from "@/features/bookings/booking-no-show-access";

const failure = (error: string) => ({ success: false as const, error });
const failed = "Failed to mark as no-show.";
const accountedWork = { OR: [
  { status: { in: ["SERVING", "COMPLETED"] } }, { served_at: { not: null } },
  { completed_at: { not: null } }, { paid_in_payslip_id: { not: null } },
] } satisfies Prisma.AvailedServiceWhereInput;

export async function markBookingNoShow(actor: BookingNoShowActor, bookingId: number) {
  try {
    return await prisma.$transaction(async tx => {
      const business = await recheckBookingNoShowAccess(tx, actor);
      if (!business) return failure("Forbidden");
      const scope = { business_id: actor.businessId, business, OR: [{ customer_id: null }, { customer: { business_id: actor.businessId } }] } satisfies Prisma.BookingWhereInput;
      const booking = await tx.booking.findFirst({ where: { id: bookingId, ...scope }, select: { id: true, status: true, customer_id: true, cancelled_at: true, updated_at: true, _count: { select: { availed_services: { where: accountedWork } } } } });
      if (!booking) return failure("Booking not found.");
      if (booking.status === "CANCELLED" || booking.cancelled_at) return failure("Booking is already cancelled.");
      if (booking.status === "COMPLETED") return failure("Cannot mark a completed booking as no-show.");
      if (!["HOLD", "ACCEPTED"].includes(booking.status) || booking._count.availed_services > 0) return failure(failed);

      const customer = booking.customer_id === null ? null : await tx.customer.findFirst({ where: { id: booking.customer_id, business_id: actor.businessId, business }, select: { id: true, no_show_count: true, trust_tier: true, last_no_show_at: true, updated_at: true } });
      if (booking.customer_id !== null && (!customer || !Number.isInteger(customer.no_show_count) || customer.no_show_count < 0 || customer.no_show_count >= 2147483647)) return failure(failed);
      const changed = await tx.booking.updateMany({
        where: { ...scope, id: booking.id, status: booking.status, customer_id: booking.customer_id, cancelled_at: null, updated_at: booking.updated_at, availed_services: { none: accountedWork } },
        data: { status: "CANCELLED" },
      });
      if (changed.count !== 1) throw new Error("Booking snapshot changed");
      const now = new Date();
      const auditActor = { actorId: actor.userId, businessId: actor.businessId };
      if (customer) {
        const count = customer.no_show_count + 1;
        const tier = count >= 2 ? "RESTRICTED" : customer.trust_tier;
        const updated = await tx.customer.updateMany({
          where: { id: customer.id, business_id: actor.businessId, business, no_show_count: customer.no_show_count, trust_tier: customer.trust_tier, last_no_show_at: customer.last_no_show_at, updated_at: customer.updated_at,
            bookings: { some: { id: booking.id, business_id: actor.businessId, customer_id: customer.id, status: "CANCELLED", cancelled_at: null } },
          }, data: { no_show_count: { increment: 1 }, last_no_show_at: now, trust_tier: tier },
        });
        if (updated.count !== 1) throw new Error("Customer snapshot changed");
        await logAudit(tx, { ...auditActor, entityType: "Customer", entityId: customer.id, action: "UPDATED", changes: { before: { no_show_count: customer.no_show_count, trust_tier: customer.trust_tier, last_no_show_at: customer.last_no_show_at }, after: { no_show_count: count, trust_tier: tier, last_no_show_at: now, bookingId: booking.id, mode: "BOOKING_NO_SHOW" } } });
      }
      await logAudit(tx, { ...auditActor, entityType: "Booking", entityId: String(booking.id), action: "STATUS_CHANGED", changes: { before: { status: booking.status }, after: { status: "CANCELLED", mode: "BOOKING_NO_SHOW" } } });
      return { success: true as const };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  } catch { return failure(failed); }
}
