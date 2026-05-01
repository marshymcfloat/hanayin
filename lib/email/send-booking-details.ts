import { prisma } from "@/prisma/prisma";
import { formatPH } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { sendSemaphorePrioritySms, truncateSms } from "@/lib/services/sms";

export async function sendBookingConfirmation(bookingId: number) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: {
          select: { name: true, phone: true },
        },
        business: {
          select: { name: true },
        },
      },
    });

    if (!booking) {
      logger.warn(`[BookingConfirmation] Booking ${bookingId} not found.`);
      return { success: false, error: "Booking not found" };
    }

    // Anonymous walk-ins have no Customer profile — skip the SMS confirmation.
    if (!booking.customer) {
      logger.info(
        `[BookingConfirmation] Booking ${bookingId} is an anonymous walk-in — no SMS to send.`,
      );
      return { success: true };
    }

    if (!booking.customer.phone) {
      logger.warn(
        `[BookingConfirmation] Booking ${bookingId} customer has no phone — skipping.`,
      );
      return { success: true };
    }

    const scheduledAt = booking.scheduled_at;
    const scheduledDate = scheduledAt ? formatPH(scheduledAt, "MMMM d, yyyy") : "N/A";
    const scheduledTime = scheduledAt ? formatPH(scheduledAt, "h:mm a") : "N/A";
    const businessName = booking.business.name;
    const firstName = booking.customer.name.split(" ")[0];

    const smsText = truncateSms(
      `Hi ${firstName}! Your booking at ${businessName} on ${scheduledDate} at ${scheduledTime} is confirmed. See you soon!`,
    );
    const smsResult = await sendSemaphorePrioritySms(booking.customer.phone, smsText);
    if (!smsResult.success) {
      logger.warn(`[BookingConfirmation] SMS failed for booking ${bookingId}:`, {
        error: smsResult.error,
      });
      return { success: false, error: smsResult.error };
    }

    return { success: true };
  } catch (error) {
    logger.error("[BookingConfirmation] Error sending booking confirmation:", { error });
    return { success: false, error };
  }
}
