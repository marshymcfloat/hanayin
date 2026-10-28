import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { BookingAvailabilityError } from "@/features/bookings/services/booking-availability";

/** The surrounding serializable transaction makes concurrent quota reads conflict. */
export async function assertBookingOfferCapacity(tx: Prisma.TransactionClient, businessId: string, offerIds: number[], excludeBookingId?: number) {
  for (const id of [...new Set(offerIds)].sort((a, b) => a - b)) {
    const offer = await tx.saleEvent.findFirst({ where: { id, business_id: businessId }, select: { slot_limit: true } });
    if (!offer) throw new BookingAvailabilityError("SALE_SLOT_LIMIT_REACHED", "This offer is no longer available.");
    if (offer.slot_limit === null) continue;
    const now = new Date();
    const active = { business_id: businessId, id: { not: excludeBookingId ?? -1 }, status: { not: "CANCELLED" as const }, OR: [{ status: { not: "HOLD" as const } }, { hold_expires_at: null }, { hold_expires_at: { gt: now } }] };
    const count = await tx.booking.count({ where: { ...active, OR: [
      { ...active, offer_applications: { some: { sale_event_id: id } } },
      { ...active, sale_event_id: id, offer_applications: { none: {} } },
    ] } });
    if (count >= offer.slot_limit) throw new BookingAvailabilityError("SALE_SLOT_LIMIT_REACHED", "This offer has reached its booking limit.");
  }
}
