import {
  AvailedServiceStatus,
  BookingStatus,
  PaymentStatus,
  Prisma,
} from "@/prisma/generated/prisma/client";

/**
 * Promote booking to COMPLETED when all services are done and payment is settled.
 * Also upgrades the customer's trust tier from NEW → TRUSTED on first completion,
 * so future bookings skip the OTP step.
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
      payment_status: true,
      customer_id: true,
    },
  });

  if (!booking) return false;
  if (booking.status === BookingStatus.CANCELLED) return false;
  if (booking.status === BookingStatus.COMPLETED) return false;
  if (booking.payment_status !== PaymentStatus.PAID) return false;

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

  // Upgrade NEW → TRUSTED so the customer skips OTP on future bookings
  await tx.customer.updateMany({
    where: { id: booking.customer_id, trust_tier: "NEW" },
    data: { trust_tier: "TRUSTED" },
  });

  return true;
}
