import { prisma } from "@/prisma/prisma";
import { formatPH, getCurrentDateTimePH } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { sendSemaphorePrioritySms } from "@/lib/services/sms";
import { buildBookingReminderSms } from "@/lib/services/booking-sms";

const BOOKING_REMINDER_CONCURRENCY = 8;
const BOOKING_REMINDER_MINUTES_BEFORE = 30;

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
    const reminderCutoff = new Date(
      now.getTime() + BOOKING_REMINDER_MINUTES_BEFORE * 60 * 1000,
    );

    const bookings = await prisma.booking.findMany({
      where: {
        status: "ACCEPTED",
        reminder_sent: false,
        scheduled_at: {
          gt: now,
          lte: reminderCutoff,
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
      `[Reminders] Checking window: ${now.toISOString()} - ${reminderCutoff.toISOString()}`,
    );
    logger.info(`[Reminders] Found ${bookings.length} bookings to remind.`);

    const results: {
      id: number;
      success: boolean;
      channels: string[];
      error?: unknown;
    }[] = [];

    await runInChunks(
      bookings,
      BOOKING_REMINDER_CONCURRENCY,
      async (booking) => {
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
          const smsText = buildBookingReminderSms({
            firstName,
            businessName,
            scheduledTime,
            bookingId: booking.id,
          });
          const smsResult = await sendSemaphorePrioritySms(
            booking.customer.phone,
            smsText,
          );
          if (smsResult.success) {
            successChannels.push("sms");
            anySuccess = true;
            logger.info(`[Reminders] SMS accepted for booking ${booking.id}.`, {
              messageId: smsResult.messageId || null,
            });
          } else {
            logger.warn(`[Reminders] SMS failed for booking ${booking.id}:`, {
              error: smsResult.error,
            });
          }
          await prisma.booking.update({
            where: { id: booking.id },
            data: smsResult.success
              ? {
                  reminder_sent: true,
                  reminder_sent_at: now,
                  reminder_message_id: smsResult.messageId || null,
                  reminder_last_error: null,
                  reminder_attempts: { increment: 1 },
                }
              : {
                  reminder_last_error:
                    smsResult.error || "Unknown Semaphore error",
                  reminder_attempts: { increment: 1 },
                },
          });
        }

        results.push({
          id: booking.id,
          success: anySuccess,
          channels: successChannels,
        });
      },
    );

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
