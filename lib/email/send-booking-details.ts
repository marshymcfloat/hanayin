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

    if (!booking || !booking.customer.email) {
      logger.warn(
        `[BookingConfirmation] Booking ${bookingId} not found or customer has no email.`,
      );
      return;
    }

    const servicesList = booking.availed_services.map((availedService) => ({
      name: availedService.service.name,
      price: availedService.final_price,
      quantity: 1,
    }));

    const paymentDisplay = getBookingPaymentDisplay({
      grandTotal: booking.grand_total,
      amountPaid: booking.amount_paid,
    });

    const scheduledAt = booking.scheduled_at;
    const scheduledDate = scheduledAt
      ? formatPH(scheduledAt, "MMMM d, yyyy")
      : "N/A";
    const scheduledTime = scheduledAt ? formatPH(scheduledAt, "h:mm a") : "N/A";
    const businessName = booking.business.name;
    const customerName = booking.customer.name;
    const bookingToken = createBookingSuccessToken({
      bookingId: booking.id,
      businessSlug: booking.business.slug,
      purpose: "details",
      ttlSeconds: BOOKING_DETAILS_TOKEN_TTL_SECONDS,
    });
    const bookingUrl = toAbsoluteUrl(
      `/${booking.business.slug}/bookings/${booking.id}?token=${encodeURIComponent(bookingToken)}`,
    );

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

    const { data, error } = await resend.emails.send({
      from: "ServiceFlow <bookings@serviceflow.store>",
      to: [booking.customer.email],
      subject: `Booking Confirmed - ${businessName}`,
      html: emailHtml,
      text: `Hi ${customerName}, your booking at ${businessName} is confirmed for ${scheduledDate} ${scheduledTime}. Amount paid: PHP ${paymentDisplay.amountPaid.toFixed(2)}. Remaining balance: PHP ${paymentDisplay.remainingBalance.toFixed(2)}. View details: ${bookingUrl}`,
    });

    if (error) {
      logger.error("[BookingConfirmation] Resend API Error:", { error });
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    logger.error("[BookingConfirmation] Error sending booking confirmation:", {
      error,
    });
    return { success: false, error };
  }
}
