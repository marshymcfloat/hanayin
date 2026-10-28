import {
  AvailedServiceStatus,
  BookingStatus,
  Prisma,
} from "@/prisma/generated/prisma/client";

/**
 * Completes a booking once all services are done. Payment settlement remains
 * independent and must be recorded explicitly by an authorized collector.
 * Also upgrades customer trust tier NEW → TRUSTED on first completion.
 */
export async function promoteBookingToCompletedIfEligible(
  tx: Prisma.TransactionClient,
  bookingId: number,
  scope?: { businessId: string; booking: Prisma.BookingWhereInput },
) {
  const select = { id: true, status: true, customer_id: true } as const;
  const booking = scope
    ? await tx.booking.findFirst({ where: { id: bookingId, business_id: scope.businessId, AND: [scope.booking] }, select })
    : await tx.booking.findUnique({ where: { id: bookingId }, select });

  if (scope && !booking) throw new Error("Booking completion snapshot changed");
  if (!booking) return false;
  if (booking.status === BookingStatus.CANCELLED) return false;
  if (booking.status === BookingStatus.COMPLETED) return false;

  const remainingUnserved = await tx.availedService.count({
    where: {
      booking_id: bookingId,
      ...(scope ? { booking: { business_id: scope.businessId, AND: [scope.booking] } } : {}),
      status: {
        notIn: [AvailedServiceStatus.COMPLETED, AvailedServiceStatus.CANCELLED],
      },
    },
  });

  if (remainingUnserved > 0) return false;

  if (scope) {
    const changed = await tx.booking.updateMany({
      where: { id: bookingId, business_id: scope.businessId, status: booking.status, customer_id: booking.customer_id, AND: [scope.booking] },
      data: { status: BookingStatus.COMPLETED },
    });
    if (changed.count !== 1) throw new Error("Booking completion snapshot changed");
  } else {
    await tx.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.COMPLETED } });
  }

  // Anonymous walk-ins have no Customer profile to upgrade — skip the trust
  // tier promotion when customer_id is null.
  if (booking.customer_id) {
    await tx.customer.updateMany({
      where: { id: booking.customer_id, trust_tier: "NEW", ...(scope ? { business_id: scope.businessId } : {}) },
      data: { trust_tier: "TRUSTED" },
    });
  }

  return true;
}
