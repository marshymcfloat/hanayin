import { prisma } from "@/prisma/prisma";
import { Resend } from "resend";
import { formatPH, getCurrentDateTimePH } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { sendSemaphorePrioritySms, truncateSms } from "@/lib/services/sms";

const BOOKING_REMINDER_CONCURRENCY = 8;

async function runInChunks<T>(
  items: T[],
  chunkSize: number,
  task: (item: T) => Promise<void>,
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.allSettled(chunk.map((item) => task(item)));
  }
}

export async function sendBookingReminders() {
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const now = getCurrentDateTimePH();
    const fortyFiveMinutesFromNow = new Date(now.getTime() + 45 * 60 * 1000);

    const bookings = await prisma.booking.findMany({
      where: {
        status: "ACCEPTED",
        reminder_sent: false,
        scheduled_at: {
          gt: now,
          lte: fortyFiveMinutesFromNow,
        },
        // Only remind if the booking was made at least 30 mins ago (skip walk-ins)
        created_at: {
          lte: new Date(now.getTime() - 30 * 60 * 1000),
        },
        // Include any booking where customer has phone OR email
        OR: [
          { customer: { phone: { not: null } } },
          { customer: { email: { not: null } } },
        ],
      },
      include: {
        customer: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
        business: {
          select: {
            name: true,
          },
        },
        availed_services: {
          select: {
            service: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    logger.info(
      `[Reminders] Checking window: ${now.toISOString()} - ${fortyFiveMinutesFromNow.toISOString()}`,
    );
    logger.info(`[Reminders] Found ${bookings.length} bookings to remind.`);

    const results: { id: number; success: boolean; channels: string[]; error?: unknown }[] = [];

    await runInChunks(bookings, BOOKING_REMINDER_CONCURRENCY, async (booking) => {
      const scheduledAt = booking.scheduled_at;
      if (!scheduledAt) return;

      const scheduledTime = formatPH(scheduledAt, "h:mm a");
      const scheduledDate = formatPH(scheduledAt, "MMMM d, yyyy");
      const businessName = booking.business.name;
      const customerName = booking.customer.name;
      const firstName = customerName.split(" ")[0];

      const successChannels: string[] = [];
      let anySuccess = false;

      // --- SMS (priority — time-sensitive) ---
      if (booking.customer.phone) {
        const smsText = truncateSms(
          `Hi ${firstName}! Reminder: your appointment at ${businessName} is at ${scheduledTime} today. See you soon!`,
        );
        const smsResult = await sendSemaphorePrioritySms(booking.customer.phone, smsText);
        if (smsResult.success) {
          successChannels.push("sms");
          anySuccess = true;
        } else {
          logger.warn(`[Reminders] SMS failed for booking ${booking.id}:`, { error: smsResult.error });
        }
      }

      // --- Email ---
      if (booking.customer.email) {
        const emailHtml = buildReminderEmailHtml({
          customerName,
          businessName,
          scheduledTime,
          scheduledDate,
          services: booking.availed_services.map((s) => s.service.name),
        });

        const { error } = await resend.emails.send({
          from: "ServiceFlow <reminders@serviceflow.store>",
          to: [booking.customer.email],
          subject: `Reminder: Appointment at ${businessName} – ${scheduledTime}`,
          html: emailHtml,
        });

        if (error) {
          logger.warn(`[Reminders] Email failed for booking ${booking.id}:`, { error });
        } else {
          successChannels.push("email");
          anySuccess = true;
        }
      }

      if (anySuccess) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { reminder_sent: true },
        });
      }

      results.push({ id: booking.id, success: anySuccess, channels: successChannels });
    });

    return {
      success: true,
      processed: results.length,
      details: results,
    };
  } catch (error) {
    logger.error("Reminder service error:", { error });
    throw error;
  }
}

function buildReminderEmailHtml({
  customerName,
  businessName,
  scheduledTime,
  scheduledDate,
  services,
}: {
  customerName: string;
  businessName: string;
  scheduledTime: string;
  scheduledDate: string;
  services: string[];
}) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Reminder</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #ffffff; color: #1f2937; -webkit-font-smoothing: antialiased; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #ffffff; padding-bottom: 60px; }
    .main-table { margin: 0 auto; max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid #f3f4f6; margin-top: 40px; }
    .header { background-color: #111827; padding: 40px; text-align: center; }
    .header-title { margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.025em; }
    .content { padding: 40px; }
    .greeting { font-size: 20px; color: #111827; margin-bottom: 24px; font-weight: 600; }
    .greeting strong { color: #10b981; }
    .text-body { color: #4b5563; font-size: 16px; margin-bottom: 32px; }
    .highlight-card { background-color: #ecfdf5; border: 1px solid #d1fae5; border-radius: 16px; padding: 32px 24px; text-align: center; margin-bottom: 32px; }
    .highlight-label { font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: #059669; font-weight: 700; margin-bottom: 12px; }
    .highlight-time { font-size: 42px; font-weight: 800; color: #111827; line-height: 1; letter-spacing: -0.05em; margin: 0; }
    .highlight-date { font-size: 18px; font-weight: 600; color: #059669; margin-top: 12px; }
    .services-section { border-top: 1px dashed #e5e7eb; padding-top: 24px; }
    .services-header { font-size: 14px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
    .service-row { padding: 12px 0; border-bottom: 1px solid #f3f4f6; }
    .service-row:last-child { border-bottom: none; }
    .service-name { font-weight: 600; color: #111827; font-size: 16px; }
    .service-icon { display: inline-block; width: 8px; height: 8px; background-color: #10b981; border-radius: 50%; margin-right: 12px; vertical-align: middle; box-shadow: 0 0 0 2px #d1fae5; }
    .footer { background-color: #f9fafb; padding: 32px; text-align: center; border-top: 1px solid #e5e7eb; }
    .footer-text { font-size: 13px; color: #9ca3af; margin: 8px 0; }
    .brand-link { color: #10b981; text-decoration: none; font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="main-table">
      <div class="header">
        <h1 class="header-title">${businessName}</h1>
      </div>
      <div class="content">
        <p class="greeting">Hello, <strong>${customerName}</strong></p>
        <p class="text-body">This is a friendly reminder that your appointment is coming up soon. We're getting everything ready for you!</p>
        <div class="highlight-card">
          <div class="highlight-label">Scheduled Time</div>
          <div class="highlight-time">${scheduledTime}</div>
          <div class="highlight-date">${scheduledDate}</div>
        </div>
        <div class="services-section">
          <div class="services-header">Services Booked</div>
          ${services.map((name) => `<div class="service-row"><span class="service-name"><span class="service-icon"></span>${name}</span></div>`).join("")}
        </div>
      </div>
      <div class="footer">
        <p class="footer-text">Need to make changes? Contact ${businessName} directly.</p>
        <p class="footer-text">&copy; ${new Date().getFullYear()} ${businessName} &middot; Powered by <a href="https://serviceflow.com" class="brand-link">ServiceFlow</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
