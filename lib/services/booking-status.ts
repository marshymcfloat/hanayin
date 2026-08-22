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
) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      customer_id: true,
    },
  });

  if (!booking) return false;
  if (booking.status === BookingStatus.CANCELLED) return false;
  if (booking.status === BookingStatus.COMPLETED) return false;

  const remainingUnserved = await tx.availedService.count({
    where: {
      booking_id: bookingId,
      status: {
        notIn: [AvailedServiceStatus.COMPLETED, AvailedServiceStatus.CANCELLED],
      },
    },
  });

  if (remainingUnserved > 0) return false;

  await tx.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.COMPLETED },
  });

  // Anonymous walk-ins have no Customer profile to upgrade — skip the trust
  // tier promotion when customer_id is null.
  if (booking.customer_id) {
    await tx.customer.updateMany({
      where: { id: booking.customer_id, trust_tier: "NEW" },
      data: { trust_tier: "TRUSTED" },
    });
  }

  return true;
}
