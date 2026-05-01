import {
  AvailedServiceStatus,
  BookingStatus,
  Prisma,
} from "@/prisma/generated/prisma/client";
import { getCurrentDateTimePH } from "@/lib/date-utils";

/**
 * Completes a booking once all services are done.
 * Auto-records payment as PAID if not already settled — cash/online payments
 * are assumed collected at point of service.
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
      payment_status: true,
      payment_method: true,
      grand_total: true,
      amount_paid: true,
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

  // Auto-settle payment when all services are done (cash/online collected at service)
  const roundMoney = (v: number) => Math.round(v * 100) / 100;
  const remainingBalance = roundMoney(
    Math.max(0, booking.grand_total - booking.amount_paid),
  );

  if (remainingBalance > 0) {
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        amount_paid: booking.grand_total,
        payment_status: "PAID",
      },
    });

    await tx.bookingPayment.create({
      data: {
        booking_id: bookingId,
        type: "MANUAL",
        status: "SUCCEEDED",
        payment_method: booking.payment_method,
        amount_principal: remainingBalance,
        amount_charged: remainingBalance,
        paid_at: getCurrentDateTimePH(),
        metadata: { source: "AUTO_SERVICE_COMPLETE" },
      },
    });
  }

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
