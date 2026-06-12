import { Resend } from "resend";
import { formatPH } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { sendSemaphorePrioritySms, truncateSms } from "@/lib/services/sms";

type SendGiftCardEmailParams = {
  businessName: string;
  customerName: string;
  customerEmail: string;
  giftCardCode: string;
  expiresAt: Date;
  includedServices: string[];
  includedPackages: string[];
};

const MAX_EMAIL_SEND_ATTEMPTS = 3;
const RETRY_DELAY_MS = 600;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryResendError(
  error: { name?: string; statusCode?: number | null } | null,
  attempt: number,
) {
  if (!error || attempt >= MAX_EMAIL_SEND_ATTEMPTS) {
    return false;
  }

  if (error.name === "rate_limit_exceeded") {
    return true;
  }

  if (error.name === "internal_server_error") {
    return true;
  }

  if (error.name === "application_error" && error.statusCode === null) {
    return true;
  }

  return typeof error.statusCode === "number" && error.statusCode >= 500;
}

export async function sendGiftCardEmail({
  businessName,
  customerName,
  customerEmail,
  giftCardCode,
  expiresAt,
  includedServices,
  includedPackages,
}: SendGiftCardEmailParams) {
  const includedItems = [
    ...includedServices.map((name) => ({ label: name, type: "Service" })),
    ...includedPackages.map((name) => ({ label: name, type: "Package" })),
  ];

  const expirationDate = formatPH(expiresAt, "MMMM d, yyyy");

  const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Gift Card</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #ffffff; color: #1f2937; -webkit-font-smoothing: antialiased; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #ffffff; padding-bottom: 60px; }
    .main-table { margin: 0 auto; max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); border: 1px solid #f3f4f6; margin-top: 40px; }
    .header { background-color: #111827; padding: 40px 40px; text-align: center; }
    .header-title { margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.025em; }
    .content { padding: 40px; }
    .greeting { font-size: 20px; color: #111827; margin-bottom: 24px; font-weight: 600; }
    .greeting strong { color: #10b981; }
    .text-body { color: #4b5563; font-size: 16px; margin-bottom: 32px; }
    .highlight-card { background-color: #ecfdf5; border: 1px solid #d1fae5; border-radius: 16px; padding: 32px 20px; text-align: center; margin-bottom: 24px; }
    .highlight-label { font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: #059669; font-weight: 700; margin-bottom: 12px; }
    .highlight-time { font-size: 44px; font-weight: 800; color: #111827; line-height: 1; letter-spacing: 0.08em; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .highlight-date { font-size: 14px; font-weight: 600; color: #059669; margin-top: 12px; }
    .services-section { margin-top: 0; border-top: 1px dashed #e5e7eb; padding-top: 24px; }
    .services-header { font-size: 14px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
    .service-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f3f4f6; }
    .service-row:last-child { border-bottom: none; }
    .service-name { font-weight: 600; color: #111827; font-size: 16px; }
    .service-type { color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
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
        <p class="text-body">You've received a gift card. Keep this code and present it when claiming your gift card in-store.</p>

        <div class="highlight-card">
          <div class="highlight-label">Gift Card Code</div>
          <div class="highlight-time">${giftCardCode}</div>
          <div class="highlight-date">Valid until ${expirationDate}</div>
        </div>

        <div class="services-section">
          <div class="services-header">Included Items</div>
          ${includedItems
            .map(
              (item) => `
            <div class="service-row">
              <span class="service-name"><span class="service-icon"></span>${item.label}</span>
              <span class="service-type">${item.type}</span>
            </div>`,
            )
            .join("")}
        </div>
      </div>

      <div class="footer">
        <p class="footer-text">For claiming instructions, contact ${businessName} directly.</p>
        <p class="footer-text">&copy; ${new Date().getFullYear()} ${businessName} &middot; Powered by <a href="https://serviceflow.store" target="_blank" class="brand-link">ServiceFlow</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    for (let attempt = 1; attempt <= MAX_EMAIL_SEND_ATTEMPTS; attempt += 1) {
      const { error } = await resend.emails.send({
        from: "ServiceFlow <reminders@serviceflow.store>",
        to: [customerEmail],
        subject: `Your gift card from ${businessName}`,
        html: emailHtml,
        text: `Hi ${customerName}, your gift card code is ${giftCardCode}. It is valid until ${expirationDate}.`,
      });

      if (!error) {
        return { success: true };
      }

      if (shouldRetryResendError(error, attempt)) {
        logger.warn("[GiftCard] Retrying gift card email after transient error", {
          error,
          customerEmail,
          attempt,
          maxAttempts: MAX_EMAIL_SEND_ATTEMPTS,
        });

        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      logger.error("[GiftCard] Failed to send gift card email", {
        error,
        customerEmail,
        attempt,
      });
      return { success: false, error };
    }

    return {
      success: false,
      error: {
        name: "application_error",
        statusCode: null,
        message: "Failed to send gift card email after retries.",
      },
    };
  } catch (error) {
    logger.error("[GiftCard] Error sending gift card email", { error });
    return { success: false, error };
  }
}

type SendGiftCardSmsParams = {
  businessName: string;
  customerName: string;
  customerPhone: string;
  giftCardCode: string;
  expiresAt: Date;
};

/**
 * Wave N4: SMS delivery for the gift-card code. Uses Semaphore's priority
 * endpoint (2 credits, no rate limit) — gift codes are time-sensitive and
 * should arrive within seconds of being generated, like booking confirmations.
 *
 * Body is intentionally short: greeting, the code, and the expiry. The full
 * formatted card (included services, brand styling) lives in the email.
 */
export async function sendGiftCardSms({
  businessName,
  customerName,
  customerPhone,
  giftCardCode,
  expiresAt,
}: SendGiftCardSmsParams) {
  const expirationDate = formatPH(expiresAt, "MMM d, yyyy");
  const firstName = customerName.trim().split(/\s+/)[0] || "there";
  const message = truncateSms(
    `Hi ${firstName}, your gift card from ${businessName} is: ${giftCardCode}. ` +
      `Valid until ${expirationDate}. Present this code in-store to claim.`,
  );

  logger.info("[GiftCard] Dispatching gift card SMS", {
    customerPhone,
    giftCardCode,
    messageLength: message.length,
  });
  const result = await sendSemaphorePrioritySms(customerPhone, message);
  if (!result.success) {
    logger.error("[GiftCard] Failed to send gift card SMS", {
      error: result.error,
      customerPhone,
      giftCardCode,
    });
  } else {
    logger.info("[GiftCard] Gift card SMS sent", {
      messageId: result.messageId,
      customerPhone,
      giftCardCode,
    });
  }
  return result;
}
