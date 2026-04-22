import { prisma } from "@/prisma/prisma";
import { Resend } from "resend";
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
          let anySuccess = false;

          // --- SMS ---
          if (hasPhone) {
            const smsText = truncateSms(
              `Hi ${firstName}, we miss you at ${business.name}! It's been a while. Book your next appointment: ${bookingLink}`,
            );
            const smsResult = await sendSemaphoreSms(customer.phone!, smsText);
            if (smsResult.success) {
              anySuccess = true;
              logger.info(`[Re-engagement] SMS sent to customer ${customerId}`);
            } else {
              logger.warn(`[Re-engagement] SMS failed for customer ${customerId}:`, { error: smsResult.error });
            }
          }

          // --- Email ---
          if (hasEmail) {
            try {
              const emailHtml = generateReEngagementEmail(business.name, customer.name, bookingLink);
              const { error } = await resend.emails.send({
                from: "ServiceFlow <reminders@serviceflow.store>",
                to: [customer.email!],
                subject: `We Miss You at ${business.name}!`,
                html: emailHtml,
              });

              if (error) {
                logger.warn(`[Re-engagement] Email failed for customer ${customerId}:`, { error });
              } else {
                anySuccess = true;
                logger.info(`[Re-engagement] Email sent to customer ${customerId}`);
              }
            } catch (emailError) {
              logger.warn(`[Re-engagement] Email error for customer ${customerId}:`, { emailError });
            }
          }

          if (anySuccess) {
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

function generateReEngagementEmail(
  businessName: string,
  customerName: string,
  bookingLink: string,
): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>We Miss You</title>
  <style>
    /* Reset & Base */
    body { margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1f2937; }
    table { border-spacing: 0; width: 100%; }
    td { padding: 0; }
    img { border: 0; }
    a { text-decoration: none; color: inherit; }
    
    /* Layout */
    .wrapper { width: 100%; background-color: #ffffff; padding-bottom: 40px; }
    .main-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #f3f4f6; border-radius: 8px; overflow: hidden; }
    
    /* Header (Navy Blue) */
    .header { background-color: #111827; padding: 40px 20px; text-align: center; }
    .business-name { color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.5px; }
    
    /* Content */
    .content-body { padding: 40px 30px; }
    .greeting { font-size: 16px; color: #111827; margin: 0 0 16px 0; font-weight: 700; }
    .greeting-name { color: #10b981; } /* The Green Name Color */
    .text-paragraph { color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 30px; margin-top: 0; }
    
    /* The Green "Info" Box */
    .highlight-box { background-color: #ecfdf5; border-radius: 8px; padding: 30px 20px; text-align: center; margin-bottom: 40px; border: 1px solid #d1fae5; }
    .box-label { color: #059669; font-size: 11px; letter-spacing: 1.5px; font-weight: 700; text-transform: uppercase; margin-bottom: 10px; display: block; }
    .box-main-text { color: #111827; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px; line-height: 1.2; }
    .box-sub-text { color: #059669; font-size: 14px; font-weight: 600; margin-top: 5px; display: block; }
    
    /* Services/Links List */
    .section-divider { border-top: 1px dashed #e5e7eb; margin-bottom: 25px; }
    .section-label { color: #6b7280; font-size: 11px; letter-spacing: 1px; font-weight: 700; text-transform: uppercase; margin-bottom: 15px; display: block; }
    
    .action-item { display: block; margin-bottom: 10px; }
    .dot { height: 8px; width: 8px; background-color: #10b981; border-radius: 50%; display: inline-block; margin-right: 12px; vertical-align: middle; }
    .action-text { color: #111827; font-size: 14px; font-weight: 600; vertical-align: middle; }
    
    /* Footer */
    .footer { background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #f3f4f6; }
    .footer-text { color: #9ca3af; font-size: 11px; margin-bottom: 6px; line-height: 1.5; }
    .brand-link { color: #2563eb; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="main-container">
      
      <!-- Dark Header -->
      <div class="header">
        <h1 class="business-name">${businessName}</h1>
      </div>

      <!-- Main Body -->
      <div class="content-body">
        
        <!-- Greeting -->
        <div class="greeting">
          Hello, <span class="greeting-name">${customerName}</span>
        </div>

        <p class="text-paragraph">
          This is a friendly reminder that we haven't seen you in a while. We are getting everything ready for your return!
        </p>

        <!-- The Green Highlight Box -->
        <a href="${bookingLink}" style="text-decoration: none; display: block;">
          <div class="highlight-box">
            <span class="box-label">BOOKING STATUS</span>
            <div class="box-main-text">Time to Return?</div>
            <span class="box-sub-text">Book your next appointment today</span>
          </div>
        </a>

        <!-- Divider -->
        <div class="section-divider"></div>

        <!-- Action Section (Mimicking Services Booked) -->
        <span class="section-label">RECOMMENDED</span>
        
        <a href="${bookingLink}" class="action-item">
          <span class="dot"></span>
          <span class="action-text">Book Appointment</span>
        </a>
        
      </div>

      <!-- Footer -->
      <div class="footer">
        <div class="footer-text">
          Need to make changes? Contact ${businessName} directly.
        </div>
        <div class="footer-text">
          &copy; ${new Date().getFullYear()} ${businessName} &middot; Powered by <a href="https://www.serviceflow.store" class="brand-link">ServiceFlow</a>
        </div>
      </div>

    </div>
  </div>
</body>
</html>
  `;
}
