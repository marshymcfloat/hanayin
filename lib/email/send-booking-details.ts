import { Resend } from "resend";
import { render } from "@react-email/render";
import BookingConfirmationEmail from "@/components/emails/BookingConfirmationEmail";
import { prisma } from "@/prisma/prisma";
import { formatPH } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { toAbsoluteUrl } from "@/lib/site-url";
import {
  BOOKING_DETAILS_TOKEN_TTL_SECONDS,
  createBookingSuccessToken,
} from "@/lib/security/booking-success-token";
import { getBookingPaymentDisplay } from "@/lib/utils/booking-payment-display";
import { sendSemaphorePrioritySms, truncateSms } from "@/lib/services/sms";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendBookingConfirmation(bookingId: number) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        business: true,
        availed_services: {
          include: {
            service: true,
          },
        },
      },
    });

    if (!booking) {
      logger.warn(`[BookingConfirmation] Booking ${bookingId} not found.`);
      return { success: false, error: "Booking not found" };
    }

    const hasEmail = !!booking.customer.email;
    const hasPhone = !!booking.customer.phone;

    if (!hasEmail && !hasPhone) {
      logger.warn(
        `[BookingConfirmation] Booking ${bookingId} customer has no email or phone — skipping.`,
      );
      return { success: true }; // not an error — customer just has no contact
    }

    const scheduledAt = booking.scheduled_at;
    const scheduledDate = scheduledAt ? formatPH(scheduledAt, "MMMM d, yyyy") : "N/A";
    const scheduledTime = scheduledAt ? formatPH(scheduledAt, "h:mm a") : "N/A";
    const businessName = booking.business.name;
    const customerName = booking.customer.name;
    const firstName = customerName.split(" ")[0];
    const paymentDisplay = getBookingPaymentDisplay({
      grandTotal: booking.grand_total,
      amountPaid: booking.amount_paid,
    });

    const bookingToken = createBookingSuccessToken({
      bookingId: booking.id,
      businessSlug: booking.business.slug,
      purpose: "details",
      ttlSeconds: BOOKING_DETAILS_TOKEN_TTL_SECONDS,
    });
    const bookingUrl = toAbsoluteUrl(
      `/${booking.business.slug}/bookings/${booking.id}?token=${encodeURIComponent(bookingToken)}`,
    );

    // --- SMS confirmation (priority — always reaches verified phone) ---
    if (hasPhone) {
      const smsText = truncateSms(
        `Hi ${firstName}! Your booking at ${businessName} on ${scheduledDate} at ${scheduledTime} is confirmed. See you soon!`,
      );
      const smsResult = await sendSemaphorePrioritySms(booking.customer.phone!, smsText);
      if (!smsResult.success) {
        logger.warn(`[BookingConfirmation] SMS failed for booking ${bookingId}:`, {
          error: smsResult.error,
        });
      }
    }

    // --- Email confirmation (detailed, with booking link) ---
    if (hasEmail) {
      const servicesList = booking.availed_services.map((availedService) => ({
        name: availedService.service.name,
        price: availedService.final_price,
        quantity: 1,
      }));

      const emailHtml = await render(
        BookingConfirmationEmail({
          customerName,
          businessName,
          serviceName: "Services",
          date: scheduledDate,
          time: scheduledTime,
          grandTotal: paymentDisplay.grandTotal.toFixed(2),
          amountPaid: paymentDisplay.amountPaid.toFixed(2),
          remainingBalance: paymentDisplay.remainingBalance.toFixed(2),
          paymentStatusLabel: paymentDisplay.paymentStatusLabel,
          bookingUrl,
          services: servicesList,
        }),
      );

      const { error } = await resend.emails.send({
        from: "ServiceFlow <bookings@serviceflow.store>",
        to: [booking.customer.email!],
        subject: `Booking Confirmed – ${businessName}`,
        html: emailHtml,
        text: `Hi ${customerName}, your booking at ${businessName} is confirmed for ${scheduledDate} at ${scheduledTime}. Amount paid: PHP ${paymentDisplay.amountPaid.toFixed(2)}. Remaining balance: PHP ${paymentDisplay.remainingBalance.toFixed(2)}. View details: ${bookingUrl}`,
      });

      if (error) {
        logger.error("[BookingConfirmation] Resend API Error:", { error });
        // SMS may have already succeeded — don't fail the whole thing
        if (!hasPhone) return { success: false, error };
      }
    }

    return { success: true };
  } catch (error) {
    logger.error("[BookingConfirmation] Error sending booking confirmation:", { error });
    return { success: false, error };
  }
}
