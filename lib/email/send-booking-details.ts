import { Resend } from "resend";
import { render } from "@react-email/render";
import { prisma } from "@/prisma/prisma";
import { formatPH } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { sendSemaphorePrioritySms, truncateSms } from "@/lib/services/sms";
import { BookingConfirmationEmail } from "@/components/emails/BookingConfirmationEmail";
import {
  BOOKING_MANAGE_TOKEN_TTL_SECONDS,
  createBookingSuccessToken,
} from "@/lib/security/booking-success-token";
import { toAbsoluteUrl } from "@/lib/site-url";

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return new Resend(process.env.RESEND_API_KEY);
}

function paymentStatusLabel(status: string, amountPaid: number, grandTotal: number) {
  if (amountPaid >= grandTotal && grandTotal > 0) return "Paid in Full";
  if (amountPaid > 0) return "Partially Paid";
  if (status === "PAID") return "Paid in Full";
  return "Unpaid";
}

export async function sendBookingConfirmation(bookingId: number) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: {
          select: { name: true, phone: true, email: true },
        },
        business: {
          select: { name: true, slug: true },
        },
        availed_services: {
          where: { cancelled_at: null },
          select: {
            price: true,
            service: { select: { name: true } },
          },
        },
      },
    });

    if (!booking) {
      logger.warn(`[BookingConfirmation] Booking ${bookingId} not found.`);
      return { success: false, error: "Booking not found" };
    }

    // Anonymous walk-ins have no Customer profile — nothing to notify.
    if (!booking.customer) {
      logger.info(
        `[BookingConfirmation] Booking ${bookingId} is an anonymous walk-in — no SMS/email to send.`,
      );
      return { success: true };
    }

    const scheduledAt = booking.scheduled_at;
    const scheduledDate = scheduledAt ? formatPH(scheduledAt, "MMMM d, yyyy") : "N/A";
    const scheduledTime = scheduledAt ? formatPH(scheduledAt, "h:mm a") : "N/A";
    const businessName = booking.business.name;
    const firstName = booking.customer.name.split(" ")[0];

    // Mint a 30-day manage token so the customer can self-serve cancel /
    // reschedule. Same token shape as the success page.
    const manageToken = createBookingSuccessToken({
      bookingId: booking.id,
      businessSlug: booking.business.slug,
      purpose: "manage",
      ttlSeconds: BOOKING_MANAGE_TOKEN_TTL_SECONDS,
    });
    const manageUrl = toAbsoluteUrl(
      `/${booking.business.slug}/booking/manage?bookingId=${booking.id}&token=${encodeURIComponent(manageToken)}`,
    );

    // --- SMS (priority — time-sensitive) ---
    if (booking.customer.phone) {
      const smsText = truncateSms(
        `Hi ${firstName}! Your booking at ${businessName} on ${scheduledDate} at ${scheduledTime} is confirmed. Manage: ${manageUrl}`,
      );
      const smsResult = await sendSemaphorePrioritySms(booking.customer.phone, smsText);
      if (!smsResult.success) {
        logger.warn(`[BookingConfirmation] SMS failed for booking ${bookingId}:`, {
          error: smsResult.error,
        });
        // Don't return here — still try the email below if available.
      }
    } else {
      logger.info(
        `[BookingConfirmation] Booking ${bookingId} customer has no phone — skipping SMS.`,
      );
    }

    // --- Email (full details + manage link) ---
    if (booking.customer.email) {
      try {
        // Group identical service+price rows so the email shows
        // "2x Foot Spa @ 150" instead of two adjacent rows.
        const grouped = new Map<string, { name: string; price: number; quantity: number }>();
        for (const row of booking.availed_services) {
          const name = row.service?.name ?? "Service";
          const key = `${name}|${row.price}`;
          const existing = grouped.get(key);
          if (existing) existing.quantity += 1;
          else grouped.set(key, { name, price: row.price, quantity: 1 });
        }
        const services = Array.from(grouped.values());
        const primaryServiceName =
          services[0]?.name ?? "Your appointment";
        const grandTotal = booking.grand_total ?? 0;
        const amountPaid = booking.amount_paid ?? 0;
        const remainingBalance = Math.max(0, grandTotal - amountPaid);

        const emailHtml = await render(
          BookingConfirmationEmail({
            customerName: booking.customer.name,
            businessName,
            serviceName: primaryServiceName,
            date: scheduledDate,
            time: scheduledTime,
            grandTotal: grandTotal.toFixed(2),
            amountPaid: amountPaid.toFixed(2),
            remainingBalance: remainingBalance.toFixed(2),
            paymentStatusLabel: paymentStatusLabel(
              booking.payment_status,
              amountPaid,
              grandTotal,
            ),
            manageUrl,
            services,
          }),
        );

        const resend = getResendClient();
        const { error } = await resend.emails.send({
          from: "ServiceFlow <notifications@serviceflow.store>",
          to: [booking.customer.email],
          subject: `Booking confirmed - ${businessName}`,
          html: emailHtml,
          text: `Hi ${firstName}, your booking at ${businessName} on ${scheduledDate} at ${scheduledTime} is confirmed. Manage your booking: ${manageUrl}`,
        });

        if (error) {
          // Soft-fail: SMS may have succeeded and email is supplementary.
          // Re-throwing here would loop the outbox retry pointlessly.
          logger.warn(
            `[BookingConfirmation] Email send failed for booking ${bookingId}:`,
            { error: error.message ?? error },
          );
        }
      } catch (emailError) {
        logger.warn(
          `[BookingConfirmation] Email render/send threw for booking ${bookingId}:`,
          { error: emailError },
        );
      }
    }

    return { success: true };
  } catch (error) {
    logger.error("[BookingConfirmation] Error sending booking confirmation:", { error });
    return { success: false, error };
  }
}
