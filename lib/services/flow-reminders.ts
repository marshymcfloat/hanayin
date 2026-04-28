import { prisma } from "@/prisma/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { FlowReminderEmail } from "@/components/emails/FlowReminderEmail";
import {
  getCurrentDateTimePH,
  getEndOfDayPH,
  getStartOfDayPH,
} from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";
import { sendSemaphoreSms, truncateSms } from "@/lib/services/sms";

const FLOW_REMINDER_EVENT_TYPE = "FLOW_REMINDER_SENT";
const FLOW_REMINDER_SEND_CONCURRENCY = 5;

function getPublicBaseUrl() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://serviceflow.store")
    .replace(/\/$/, "");
  return baseUrl;
}

function toPublicBusinessLink(baseUrl: string, businessSlug: string, websiteEnabled: boolean) {
  const suffix = websiteEnabled ? "" : "/booking";
  return `${baseUrl}/${businessSlug}${suffix}`;
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

function readPayloadString(
  payload: unknown,
  key: string,
): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function sendFlowReminders() {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const baseUrl = getPublicBaseUrl();
  const businessLinkCache = new Map<string, string>();

  try {
    // Use Philippine timezone for "today"
    const today = getCurrentDateTimePH();
    const startOfToday = getStartOfDayPH(today);
    const endOfToday = getEndOfDayPH(today);

    // 1. Get all active service flows
    const activeFlows = await prisma.serviceFlow.findMany({
      select: {
        id: true,
        business_id: true,
        delay_duration: true,
        delay_unit: true,
        type: true,
        trigger_service_id: true,
        trigger_service: {
          select: {
            name: true,
          },
        },
        suggested_service: {
          select: {
            name: true,
          },
        },
      },
    });

    logger.info(
      `[Flow Reminders] Found ${activeFlows.length} configured flows.`,
    );

    let sentCount = 0;
    let duplicateSkips = 0;

    async function getPublicBookingLink(businessSlug: string) {
      const cached = businessLinkCache.get(businessSlug);
      if (cached) return cached;

      const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
      const link = toPublicBusinessLink(baseUrl, businessSlug, entitlements.website);
      businessLinkCache.set(businessSlug, link);
      return link;
    }

    // 2. For each flow, find bookings that trigger it today
    for (const flow of activeFlows) {
      // Calculate the "completed_at" date we are looking for.
      // If we want to send reminder TODAY, the booking must have happened X days ago.
      // So target_completion_date = today - delay
      // BUT calculating exact date subtraction is tricky with variable units.
      // Instead, let's fetch recent completed bookings and filter in memory or find a range.
      // A better approach for scalability: Find bookings completed roughly X time ago.

      // Let's use a wide range query for bookings of the trigger service
      // Better Query: Find "AvailedService" items where service_id == trigger_service_id
      // and status == COMPLETED.

      // We want: completed_at + delay == today
      // So: completed_at == today - delay
      const lookbackDate = today;

      // Helper to subtract time (now timezone-aware)
      const subtractDelay = (
        date: Date,
        amount: number,
        unit: "DAYS" | "WEEKS" | "MONTHS",
      ) => {
        const d = new Date(date);
        if (unit === "DAYS") d.setDate(d.getDate() - amount);
        if (unit === "WEEKS") d.setDate(d.getDate() - amount * 7);
        if (unit === "MONTHS") d.setMonth(d.getMonth() - amount);
        return d;
      };

      const checkDate = subtractDelay(
        lookbackDate,
        flow.delay_duration,
        flow.delay_unit,
      );

      // Use Philippine timezone for start/end of day
      const startOfCheck = getStartOfDayPH(checkDate);
      const endOfCheck = getEndOfDayPH(checkDate);

      const qualifyingServices = await prisma.availedService.findMany({
        where: {
          service_id: flow.trigger_service_id,
          // Use 'completed_at' if available, otherwise 'served_at' or 'created_at' as fallback
          // Assuming 'completed_at' is populated for completed services
          OR: [
            { completed_at: { gte: startOfCheck, lte: endOfCheck } },
            // Fallback: if served_at matches date
            {
              completed_at: null,
              served_at: { gte: startOfCheck, lte: endOfCheck },
            },
          ],
          status: "COMPLETED",
          booking: {
            customer: {
              OR: [
                { phone: { not: null } },
                { email: { not: null } },
              ],
            },
          },
        },
        select: {
          completed_at: true,
          booking: {
            select: {
              customer_id: true,
              business_id: true,
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
                  slug: true,
                },
              },
            },
          },
        },
      });

      logger.info(
        `[Flow Reminders] Flow ${flow.id}: Found ${qualifyingServices.length} qualifying services from ${checkDate.toDateString()}`,
      );

      const existingReminderEvents = await prisma.outboxMessage.findMany({
        where: {
          event_type: FLOW_REMINDER_EVENT_TYPE,
          aggregate_type: "ServiceFlow",
          aggregate_id: String(flow.id),
          business_id: flow.business_id,
          processed: true,
          created_at: {
            gte: startOfToday,
            lte: endOfToday,
          },
        },
        select: {
          payload: true,
        },
      });

      const remindedCustomerIds = new Set<string>();
      for (const event of existingReminderEvents) {
        const customerId = readPayloadString(event.payload, "customerId");
        if (customerId) {
          remindedCustomerIds.add(customerId);
        }
      }

      const uniqueServicesByCustomer = new Map<string, (typeof qualifyingServices)[number]>();
      for (const item of qualifyingServices) {
        const customerId = String(item.booking.customer_id);
        if (!uniqueServicesByCustomer.has(customerId)) {
          uniqueServicesByCustomer.set(customerId, item);
        }
      }

      const sendQueue = Array.from(uniqueServicesByCustomer.values()).filter(
        (item) => {
          const customerId = String(item.booking.customer_id);
          if (remindedCustomerIds.has(customerId)) {
            duplicateSkips += 1;
            return false;
          }
          return true;
        },
      );

      await runInChunks(
        sendQueue,
        FLOW_REMINDER_SEND_CONCURRENCY,
        async (item) => {
          const hasEmail = !!item.booking.customer.email;
          const hasPhone = !!item.booking.customer.phone;
          if (!hasEmail && !hasPhone) return;

          const customerId = String(item.booking.customer_id);

          const customerName = item.booking.customer.name;
          const firstName = customerName.split(" ")[0];
          const businessName = item.booking.business.name;
          const serviceName = flow.trigger_service.name;
          const nextServiceName = flow.suggested_service.name;

          const bookingLink = await getPublicBookingLink(item.booking.business.slug);

          const isRequired = flow.type === "REQUIRED";

          const subject = isRequired
            ? `Action Required: Next step for your ${serviceName}`
            : `Recommendation: Try ${nextServiceName} at ${businessName}`;

          const completedOn = item.completed_at?.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) ?? null;
          const emailHtml = hasEmail
            ? await render(
                FlowReminderEmail({
                  customerName,
                  businessName,
                  triggerServiceName: serviceName,
                  nextServiceName,
                  bookingLink,
                  isRequired,
                  completedOn,
                }),
              )
            : null;

          let smsSent = false;
          let emailSent = false;

          // --- SMS ---
          if (hasPhone) {
            const smsText = truncateSms(
              isRequired
                ? `Hi ${firstName}, it's time for your follow-up ${nextServiceName} at ${businessName}. Book now: ${bookingLink}`
                : `Hi ${firstName}, we recommend ${nextServiceName} after your recent ${serviceName} at ${businessName}. Book: ${bookingLink}`,
            );
            const smsResult = await sendSemaphoreSms(item.booking.customer.phone!, smsText);
            if (smsResult.success) {
              smsSent = true;
            } else {
              logger.warn(`[Flow Reminders] SMS failed for customer ${customerId}:`, { error: smsResult.error });
            }
          }

          // --- Email ---
          if (hasEmail && emailHtml) {
            const { error } = await resend.emails.send({
              from: "ServiceFlow <reminders@serviceflow.store>",
              to: [item.booking.customer.email!],
              subject,
              html: emailHtml,
            });

            if (error) {
              logger.warn(`[Flow Reminders] Email failed for customer ${customerId}:`, { error });
            } else {
              emailSent = true;
            }
          }

          if (smsSent || emailSent) {
            sentCount++;
            await prisma.outboxMessage.create({
              data: {
                event_type: FLOW_REMINDER_EVENT_TYPE,
                aggregate_type: "ServiceFlow",
                aggregate_id: String(flow.id),
                business_id: item.booking.business_id,
                payload: {
                  customerId,
                  customerName,
                  customerEmail: item.booking.customer.email ?? null,
                  customerPhone: item.booking.customer.phone ?? null,
                  triggerServiceName: serviceName,
                  suggestedServiceName: nextServiceName,
                  flowType: flow.type,
                  sentAt: getCurrentDateTimePH().toISOString(),
                  smsSent,
                  emailSent,
                },
                processed: true,
                processed_at: getCurrentDateTimePH(),
              },
            });
            remindedCustomerIds.add(customerId);
          }
        },
      );
    }

    return {
      success: true,
      flows_checked: activeFlows.length,
      emails_sent: sentCount,
      duplicate_skips: duplicateSkips,
    };
  } catch (error) {
    logger.error("[Flow Reminders] Error:", { error });
    throw error;
  }
}
