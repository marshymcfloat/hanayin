import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { logAudit } from "@/lib/services/audit";
import { recheckBookingCommandAccess, type BookingCommandActor } from "@/features/bookings/booking-command-access";

const failure = (error: string) => ({ success: false as const, error });
const failed = "Failed to update status";
const unfinished = { status: { notIn: ["COMPLETED", "CANCELLED"] } } satisfies Prisma.AvailedServiceWhereInput;

export async function completeBookingManually(actor: BookingCommandActor, bookingId: number) {
  try {
    return await prisma.$transaction(async tx => {
      const business = await recheckBookingCommandAccess(tx, actor, "BOOKING_MODIFY");
      if (!business) return failure("Forbidden");
      const references = { service: { business_id: actor.businessId }, OR: [{ package_id: null }, { package: { business_id: actor.businessId } }] } satisfies Prisma.AvailedServiceWhereInput;
      const scope = { business_id: actor.businessId, business, OR: [{ customer_id: null }, { customer: { business_id: actor.businessId } }], availed_services: { every: references } } satisfies Prisma.BookingWhereInput;
      const booking = await tx.booking.findFirst({ where: { id: bookingId, ...scope }, select: { id: true, status: true, customer_id: true, payment_status: true, amount_paid: true, grand_total: true, cancelled_at: true, cancelled_by_customer: true, updated_at: true, _count: { select: { availed_services: { where: unfinished } } } } });
      if (!booking) return failure("Booking not found.");
      if (booking.status !== "ACCEPTED" || booking.cancelled_at || booking.cancelled_by_customer) return failure("Only active accepted bookings can be manually completed.");
      if (booking.payment_status !== "PAID") return failure("Booking cannot be completed until payment is fully settled.");
      if (booking._count.availed_services > 0) return failure("All service lines must be completed or cancelled first.");
      const changed = await tx.booking.updateMany({
        where: { ...scope, id: booking.id, status: "ACCEPTED", customer_id: booking.customer_id, payment_status: "PAID", amount_paid: booking.amount_paid, grand_total: booking.grand_total, cancelled_at: null, cancelled_by_customer: false, updated_at: booking.updated_at, availed_services: { every: references, none: unfinished } },
        data: { status: "COMPLETED" },
      });
      if (changed.count !== 1) throw new Error("Booking snapshot changed");
      await logAudit(tx, { actorId: actor.userId, businessId: actor.businessId, entityType: "Booking", entityId: String(booking.id), action: "STATUS_CHANGED", changes: { before: { status: booking.status }, after: { status: "COMPLETED", mode: "BOOKING_MANUAL_COMPLETION" } } });
      return { success: true as const };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  } catch { return failure(failed); }
}
