import { Resend } from "resend";
import { deliverPayrollNotification } from "@/features/notifications/public";
import { render } from "@react-email/render";
import { BookingCancelledEmail } from "@/components/emails/BookingCancelledEmail";

import { logger } from "@/lib/logger";
import { prisma } from "@/prisma/prisma";
import { toAbsoluteUrl } from "@/lib/site-url";
import type { OutboxEventType, OutboxPayloadMap } from "@/lib/services/outbox";
import {
  deliverSocialTargetPublish,
  SocialNonRetryableError,
} from "@/lib/services/social/deliver-social-target";
import {
  BOOKING_DETAILS_TOKEN_TTL_SECONDS,
  createBookingSuccessToken,
} from "@/lib/security/booking-success-token";
import { sendSemaphorePrioritySms, truncateSms } from "@/lib/services/sms";

export class NonRetryableOutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableOutboxError";
  }
}

export function isNonRetryableOutboxError(error: unknown) {
  return (
    error instanceof NonRetryableOutboxError ||
    error instanceof SocialNonRetryableError
  );
}

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return new Resend(process.env.RESEND_API_KEY);
}

function formatPhpFromCentavos(amountCentavos: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amountCentavos / 100);
}

async function sendHtmlEmail(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}) {
  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: "ServiceFlow <notifications@serviceflow.store>",
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  if (error) {
    throw new Error(
      typeof error.message === "string"
        ? error.message
        : "Failed to send email via Resend",
    );
  }
}

async function sendBookingCancelledNotification(
  payload: OutboxPayloadMap["BOOKING_CANCELLED"],
) {
  const booking = await prisma.booking.findUnique({
    where: { id: payload.bookingId },
    select: {
      customer: {
        select: {
          email: true,
          name: true,
          phone: true,
        },
      },
      business: {
        select: {
          name: true,
        },
      },
    },
  });

  // Anonymous walk-ins have no customer relation — the booking carries no
  // contactable record. The fallback below to payload.email still runs, but
  // we don't reach into a null relation.
  const recipientEmail = payload.email ?? booking?.customer?.email ?? null;
  const recipientPhone = booking?.customer?.phone ?? null;
  const customerName =
    payload.customerName?.trim() || booking?.customer?.name || "there";
  const firstName = customerName.split(" ")[0];
  const businessName = booking?.business.name || "your service provider";
  const reason = payload.reason;

  if (!recipientEmail && !recipientPhone) {
    throw new NonRetryableOutboxError(
      `[Outbox:BOOKING_CANCELLED] No contact info for booking ${payload.bookingId}`,
    );
  }

  // --- SMS (priority — time-sensitive cancellation) ---
  if (recipientPhone) {
    const smsText = truncateSms(
      `Hi ${firstName}, your booking at ${businessName} has been cancelled. ${reason ? `Reason: ${reason}. ` : ""}Please contact us to rebook.`,
    );
    const smsResult = await sendSemaphorePrioritySms(recipientPhone, smsText);
    if (!smsResult.success) {
      logger.warn(`[Outbox:BOOKING_CANCELLED] SMS failed for booking ${payload.bookingId}:`, {
        error: smsResult.error,
      });
    }
  }

  // --- Email ---
  if (recipientEmail) {
    const emailHtml = await render(
      BookingCancelledEmail({ customerName, businessName, reason }),
    );
    await sendHtmlEmail({
      to: [recipientEmail],
      subject: `Booking cancelled – ${businessName}`,
      html: emailHtml,
      text: `Hi ${customerName}, your booking with ${businessName} was cancelled.${reason ? ` Reason: ${reason}.` : ""} Please contact us to rebook.`,
    });
  }
}

async function sendPaymentConfirmedEmail(
  payload: OutboxPayloadMap["PAYMENT_CONFIRMED"],
  businessId: string,
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, slug: true },
  });
  const businessName = business?.name || "ServiceFlow";
  const receiptAmount = formatPhpFromCentavos(
    Math.round(payload.amount * 100),
  );
  const bookingToken =
    business?.slug && payload.bookingId
      ? createBookingSuccessToken({
          bookingId: payload.bookingId,
          businessSlug: business.slug,
          purpose: "details",
          ttlSeconds: BOOKING_DETAILS_TOKEN_TTL_SECONDS,
        })
      : null;
  const bookingPath =
    business?.slug && payload.bookingId && bookingToken
      ? `/${business.slug}/bookings/${payload.bookingId}?token=${encodeURIComponent(bookingToken)}`
      : null;
  const bookingLink = bookingPath ? toAbsoluteUrl(bookingPath) : null;

  await sendHtmlEmail({
    to: [payload.email],
    subject: `Payment received - ${businessName}`,
    html: `
      <p>Payment confirmed for booking #${payload.bookingId}.</p>
      <p>Amount received: <strong>${receiptAmount}</strong></p>
      ${bookingLink ? `<p>View booking: <a href="${bookingLink}">${bookingLink}</a></p>` : ""}
    `,
    text: `Payment confirmed for booking #${payload.bookingId}. Amount received: ${receiptAmount}.${bookingLink ? ` View booking: ${bookingLink}` : ""}`,
  });
}

async function sendReminderDueEmail(
  payload: OutboxPayloadMap["REMINDER_DUE"],
  businessId: string,
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true },
  });
  const businessName = business?.name || "ServiceFlow";

  await sendHtmlEmail({
    to: [payload.email],
    subject: `Upcoming appointment reminder - ${businessName}`,
    html: `
      <p>Hi ${payload.customerName},</p>
      <p>This is a reminder for your upcoming appointment.</p>
      <p>Scheduled at: <strong>${payload.scheduledAt}</strong></p>
      <p>Booking reference: #${payload.bookingId}</p>
    `,
    text: `Hi ${payload.customerName}, reminder for your upcoming appointment at ${payload.scheduledAt}. Booking #${payload.bookingId}.`,
  });
}

async function sendPayslipGeneratedEmail(
  payload: OutboxPayloadMap["PAYSLIP_GENERATED"],
) {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payload.payslipId },
    include: {
      employee: {
        include: {
          user: {
            select: { name: true },
          },
          business: {
            select: { name: true },
          },
        },
      },
    },
  });

  const employeeName =
    payload.employeeName ||
    payslip?.employee.user.name ||
    "team member";
  const businessName = payslip?.employee.business.name || "ServiceFlow";
  const periodText = payload.period || "latest payroll period";
  const totalSalaryText =
    typeof payload.totalSalary === "number"
      ? new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency: "PHP",
        }).format(payload.totalSalary)
      : null;

  await sendHtmlEmail({
    to: [payload.employeeEmail],
    subject: `Payslip ready - ${businessName}`,
    html: `
      <p>Hi ${employeeName},</p>
      <p>Your payslip is now available for ${periodText}.</p>
      ${totalSalaryText ? `<p>Total: <strong>${totalSalaryText}</strong></p>` : ""}
      <p>Please contact your owner/admin for details.</p>
    `,
    text: `Hi ${employeeName}, your payslip is now available for ${periodText}.${totalSalaryText ? ` Total: ${totalSalaryText}.` : ""}`,
  });
}

function splitEmails(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function getPlatformAdminRecipients() {
  // Platform admin notification recipients are now driven exclusively by
  // PLATFORM_BILLING_EMAILS (User accounts no longer carry an email field —
  // they authenticate via contact_number). Configure that env var with a
  // comma-separated list of addresses that should receive billing alerts.
  const envRecipients = new Set<string>(
    splitEmails(process.env.PLATFORM_BILLING_EMAILS),
  );

  return Array.from(envRecipients);
}

async function sendManualPaymentSubmittedEmail(
  payload: OutboxPayloadMap["MANUAL_PAYMENT_SUBMITTED"],
) {
  const recipients = await getPlatformAdminRecipients();
  if (recipients.length === 0) {
    throw new NonRetryableOutboxError(
      "[Outbox:MANUAL_PAYMENT_SUBMITTED] No platform admin recipients configured",
    );
  }

  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: payload.invoiceId },
    include: {
      business: {
        select: { name: true, slug: true },
      },
    },
  });

  const businessName = invoice?.business.name || payload.businessSlug;
  const amountText =
    typeof payload.amountCentavos === "number"
      ? formatPhpFromCentavos(payload.amountCentavos)
      : "Not provided";
  const proofText = payload.proofUrl ? `Proof URL: ${payload.proofUrl}` : "No proof URL";
  const noteText = payload.note ? `Note: ${payload.note}` : "No note";

  await sendHtmlEmail({
    to: recipients,
    subject: `Manual payment submitted - ${businessName}`,
    html: `
      <p>A business owner submitted a manual payment reference.</p>
      <ul>
        <li>Business: ${businessName}</li>
        <li>Invoice ID: ${payload.invoiceId}</li>
        <li>Reference: ${payload.paymentReference}</li>
        <li>Amount: ${amountText}</li>
        <li>${noteText}</li>
        <li>${proofText}</li>
        <li>Submitted at: ${payload.submittedAt}</li>
      </ul>
    `,
    text: `Manual payment submitted. Business: ${businessName}. Invoice: ${payload.invoiceId}. Reference: ${payload.paymentReference}. Amount: ${amountText}. ${noteText}. ${proofText}. Submitted at: ${payload.submittedAt}.`,
  });
}

async function sendSubscriptionPaymentConfirmedNotification(
  payload: OutboxPayloadMap["SUBSCRIPTION_PAYMENT_CONFIRMED"],
) {
  // Owners are identified by contact_number, not email (the User.email
  // column was renamed to contact_number in the schema rename). SMS is
  // the canonical notification channel for owners; PR adding email
  // would need to ship the email column first.
  const owners = await prisma.owner.findMany({
    where: { business_id: payload.businessId },
    include: {
      user: { select: { contact_number: true, name: true } },
      business: { select: { name: true } },
    },
  });
  if (owners.length === 0) {
    throw new NonRetryableOutboxError(
      `[Outbox:SUBSCRIPTION_PAYMENT_CONFIRMED] No owners for business ${payload.businessId}`,
    );
  }

  const businessName = owners[0]?.business.name ?? "your business";
  const amountText = formatPhpFromCentavos(payload.amountPaidCentavos);
  const periodEnds = new Date(payload.periodEndsAt).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  for (const owner of owners) {
    if (!owner.user.contact_number) continue;
    const firstName = owner.user.name?.split(" ")[0] ?? "there";
    const smsText = truncateSms(
      `Hi ${firstName}, your ServiceFlow subscription payment for ${businessName} (${amountText}) is confirmed. Next bill: ${periodEnds}.`,
    );
    const smsResult = await sendSemaphorePrioritySms(
      owner.user.contact_number,
      smsText,
    );
    if (!smsResult.success) {
      logger.warn(
        `[Outbox:SUBSCRIPTION_PAYMENT_CONFIRMED] SMS failed for owner ${owner.user.contact_number}`,
        { error: smsResult.error },
      );
    }
  }
}

export async function deliverOutboxEvent<TType extends OutboxEventType>(params: {
  eventType: TType;
  payload: OutboxPayloadMap[TType];
  businessId: string;
  outboxMessageId?: string;
}) {
  switch (params.eventType) {
    case "PAYROLL_PUBLISHED": {
      const result = await deliverPayrollNotification(params.businessId, params.payload as OutboxPayloadMap["PAYROLL_PUBLISHED"]);
      if (result.status === "NON_RETRYABLE") throw new NonRetryableOutboxError(result.error);
      if (result.status === "RETRY") throw new Error(result.error);
      return;
    }
    case "BOOKING_CREATED":
      return;
    case "BOOKING_CONFIRMED": {
      const { sendBookingConfirmation } = await import(
        "@/lib/email/send-booking-details"
      );
      const result = await sendBookingConfirmation(
        (params.payload as OutboxPayloadMap["BOOKING_CONFIRMED"]).bookingId,
      );
      if (!result?.success) {
        throw new Error(
          result?.error ? String(result.error) : "Failed to send booking confirmation",
        );
      }
      return;
    }
    case "BOOKING_CANCELLED":
      await sendBookingCancelledNotification(
        params.payload as OutboxPayloadMap["BOOKING_CANCELLED"],
      );
      return;
    case "BOOKING_STAFFING_CONFLICT_DETECTED":
      return;
    case "PAYMENT_CONFIRMED":
      await sendPaymentConfirmedEmail(
        params.payload as OutboxPayloadMap["PAYMENT_CONFIRMED"],
        params.businessId,
      );
      return;
    case "REMINDER_DUE":
      await sendReminderDueEmail(
        params.payload as OutboxPayloadMap["REMINDER_DUE"],
        params.businessId,
      );
      return;
    case "PAYSLIP_GENERATED":
      await sendPayslipGeneratedEmail(
        params.payload as OutboxPayloadMap["PAYSLIP_GENERATED"],
      );
      return;
    case "MANUAL_PAYMENT_SUBMITTED":
      await sendManualPaymentSubmittedEmail(
        params.payload as OutboxPayloadMap["MANUAL_PAYMENT_SUBMITTED"],
      );
      return;
    case "SUBSCRIPTION_PAYMENT_CONFIRMED":
      await sendSubscriptionPaymentConfirmedNotification(
        params.payload as OutboxPayloadMap["SUBSCRIPTION_PAYMENT_CONFIRMED"],
      );
      return;
    case "FLOW_REMINDER_SENT":
      return;
    case "RE_ENGAGEMENT_REMINDER_SENT":
      return;
    case "SOCIAL_TARGET_PUBLISH":
      await deliverSocialTargetPublish({
        socialPostTargetId: (
          params.payload as OutboxPayloadMap["SOCIAL_TARGET_PUBLISH"]
        ).socialPostTargetId,
        businessId: params.businessId,
        outboxMessageId: params.outboxMessageId,
      });
      return;
    default:
      logger.warn("[Outbox] Unsupported event type in delivery", {
        eventType: params.eventType,
      });
  }
}

