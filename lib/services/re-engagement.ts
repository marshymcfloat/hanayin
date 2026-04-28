import { prisma } from "@/prisma/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { ReEngagementEmail } from "@/components/emails/ReEngagementEmail";
import { getCurrentDateTimePH, getStartOfDayPH } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { sendSemaphoreSms, truncateSms } from "@/lib/services/sms";

const RE_ENGAGEMENT_EVENT_TYPE = "RE_ENGAGEMENT_REMINDER_SENT";
const RE_ENGAGEMENT_SEND_CONCURRENCY = 5;

type ReEngagementSendResult = {
  business: string;
  customerId: string;
  customerEmail: string;
  success: boolean;
  error?: unknown;
};

function getPublicBookingLink(businessSlug: string) {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://serviceflow.store")
    .replace(/\/$/, "");
  return `${baseUrl}/${businessSlug}`;
}

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

export async function sendReEngagementEmails() {
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    // Get current date in Philippine timezone
    const nowPH = getStartOfDayPH(getCurrentDateTimePH());
    // Calculate 60 days ago in Philippine timezone
    const sixtyDaysAgo = new Date(nowPH.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Get all businesses
    const businesses = await prisma.business.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    logger.info(`[Re-engagement] Processing ${businesses.length} businesses`);
    logger.info(
      `[Re-engagement] Cutoff date (60 days ago PH time): ${sixtyDaysAgo.toISOString()}`,
    );

    const allResults: ReEngagementSendResult[] = [];
    let duplicateSkips = 0;

    for (const business of businesses) {
      // Find customers who:
      // 1. Have at least one COMPLETED booking
      // 2. Their most recent booking was more than 60 days ago
      // 3. Have a valid email address
      const inactiveCustomers = await prisma.customer.findMany({
        where: {
          business_id: business.id,
          OR: [
            { phone: { not: null } },
            { email: { not: null } },
          ],
          bookings: {
            some: {
              status: "COMPLETED",
            },
            none: {
              status: "COMPLETED",
              created_at: {
                gt: sixtyDaysAgo,
              },
            },
          },
        },
        include: {
          bookings: {
            where: {
              status: "COMPLETED",
            },
            orderBy: {
              created_at: "desc",
            },
            take: 1,
          },
        },
      });

      logger.info(
        `[Re-engagement] Business "${business.name}": Found ${inactiveCustomers.length} inactive customers`,
      );
      const customersToEmail = inactiveCustomers;

      let lastSentByCustomer = new Map<string, Date>();

      if (inactiveCustomers.length > 0) {
        const customerIds = customersToEmail.map((customer) =>
          String(customer.id),
        );
        const earliestLastBooking = customersToEmail.reduce((earliest, customer) => {
          const lastBookingAt = customer.bookings[0]?.created_at;
          if (!lastBookingAt) return earliest;
          return lastBookingAt < earliest ? lastBookingAt : earliest;
        }, customersToEmail[0].bookings[0].created_at);

        const existingEvents = await prisma.outboxMessage.findMany({
          where: {
            business_id: business.id,
            event_type: RE_ENGAGEMENT_EVENT_TYPE,
            aggregate_type: "Customer",
            aggregate_id: {
              in: customerIds,
            },
            processed: true,
            created_at: {
              gte: earliestLastBooking,
            },
          },
          select: {
            aggregate_id: true,
            created_at: true,
          },
        });

        lastSentByCustomer = existingEvents.reduce((map, event) => {
          const existing = map.get(event.aggregate_id);
          if (!existing || event.created_at > existing) {
            map.set(event.aggregate_id, event.created_at);
          }
          return map;
        }, new Map<string, Date>());
      }

      // Send emails
      await runInChunks(
        customersToEmail,
        RE_ENGAGEMENT_SEND_CONCURRENCY,
        async (customer) => {
          const hasEmail = !!customer.email;
          const hasPhone = !!customer.phone;
          if (!hasEmail && !hasPhone) return;

          const lastBookingDate = customer.bookings[0]?.created_at;
          if (!lastBookingDate) return;

          const customerId = String(customer.id);
          const lastSentAt = lastSentByCustomer.get(customerId);
          if (lastSentAt && lastSentAt >= lastBookingDate) {
            duplicateSkips += 1;
            return;
          }

          const bookingLink = getPublicBookingLink(business.slug);
          const firstName = customer.name.split(" ")[0];
          let smsSent = false;
          let emailSent = false;

          // --- SMS ---
          if (hasPhone) {
            const smsText = truncateSms(
              `Hi ${firstName}, we miss you at ${business.name}! It's been a while. Book your next appointment: ${bookingLink}`,
            );
            const smsResult = await sendSemaphoreSms(customer.phone!, smsText);
            if (smsResult.success) {
              smsSent = true;
              logger.info(`[Re-engagement] SMS sent to customer ${customerId}`);
            } else {
              logger.warn(`[Re-engagement] SMS failed for customer ${customerId}:`, { error: smsResult.error });
            }
          }

          // --- Email ---
          if (hasEmail) {
            try {
              const emailHtml = await render(
                ReEngagementEmail({ customerName: customer.name, businessName: business.name, bookingLink }),
              );
              const { error } = await resend.emails.send({
                from: "ServiceFlow <reminders@serviceflow.store>",
                to: [customer.email!],
                subject: `We Miss You at ${business.name}!`,
                html: emailHtml,
              });

              if (error) {
                logger.warn(`[Re-engagement] Email failed for customer ${customerId}:`, { error });
              } else {
                emailSent = true;
                logger.info(`[Re-engagement] Email sent to customer ${customerId}`);
              }
            } catch (emailError) {
              logger.warn(`[Re-engagement] Email error for customer ${customerId}:`, { emailError });
            }
          }

          if (smsSent || emailSent) {
            const sentAt = getCurrentDateTimePH();
            await prisma.outboxMessage.create({
              data: {
                event_type: RE_ENGAGEMENT_EVENT_TYPE,
                aggregate_type: "Customer",
                aggregate_id: customerId,
                business_id: business.id,
                payload: {
                  customerId,
                  customerName: customer.name,
                  customerEmail: customer.email ?? null,
                  customerPhone: customer.phone ?? null,
                  lastCompletedBookingId: customer.bookings[0]?.id ?? null,
                  lastCompletedBookingAt: lastBookingDate.toISOString(),
                  sentAt: sentAt.toISOString(),
                  smsSent,
                  emailSent,
                },
                processed: true,
                processed_at: sentAt,
              },
            });
            lastSentByCustomer.set(customerId, sentAt);
            allResults.push({ business: business.name, customerId: customer.id, customerEmail: customer.email ?? "", success: true });
          } else {
            allResults.push({ business: business.name, customerId: customer.id, customerEmail: customer.email ?? "", success: false });
          }
        },
      );
    }

    const successCount = allResults.filter((r) => r.success).length;
    const failCount = allResults.filter((r) => !r.success).length;

    logger.info(
      `[Re-engagement] Summary: ${successCount} sent, ${failCount} failed`,
    );

    return {
      success: true,
      totalProcessed: allResults.length,
      sent: successCount,
      failed: failCount,
      duplicateSkips,
      details: allResults,
    };
  } catch (error) {
    logger.error("[Re-engagement] Service error:", { error });
    throw error;
  }
}

