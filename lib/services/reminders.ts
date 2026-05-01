import { prisma } from "@/prisma/prisma";
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
        customer: { phone: { not: null } },
      },
      include: {
        customer: {
          select: {
            name: true,
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
      // Anonymous walk-ins have no Customer profile and therefore can't be
      // reminded. Skip defensively even though the where clause already filters
      // on `customer.phone IS NOT NULL` (which implies a non-null relation).
      if (!booking.customer) return;

      const scheduledTime = formatPH(scheduledAt, "h:mm a");
      const businessName = booking.business.name;
      const firstName = booking.customer.name.split(" ")[0];

      const successChannels: string[] = [];
      let anySuccess = false;

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

