import { normalizePhilippinePhone } from "@/lib/services/sms-otp";

const SEMAPHORE_API_URL = "https://semaphore.co/api/v4";

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends a plain SMS via Semaphore's /messages endpoint.
 * Never throws — returns { success: false, error } on failure so callers
 * can treat SMS as a best-effort channel without crashing the main flow.
 *
 * Use sendSemaphorePrioritySms for time-sensitive messages (costs 2 credits,
 * no rate limit). Use this for everything else (1 credit, 120 req/min).
 */
export async function sendSemaphoreSms(
  phone: string,
  message: string,
): Promise<SmsResult> {
  return sendSms(phone, message, "messages");
}

/**
 * Sends via Semaphore's /priority endpoint — 2 credits, no rate limit.
 * Use for appointment reminders and booking confirmations.
 */
export async function sendSemaphorePrioritySms(
  phone: string,
  message: string,
): Promise<SmsResult> {
  return sendSms(phone, message, "priority");
}

async function sendSms(
  phone: string,
  message: string,
  endpoint: "messages" | "priority",
): Promise<SmsResult> {
  const apiKey = process.env.SEMAPHORE_API;
  if (!apiKey) {
    return { success: false, error: "SEMAPHORE_API is not configured" };
  }

  const normalizedPhone = normalizePhilippinePhone(phone);

  const params = new URLSearchParams({
    apikey: apiKey,
    number: normalizedPhone,
    message,
  });

  const senderName = process.env.SEMAPHORE_SENDER_NAME;
  if (senderName) params.append("sendername", senderName);

  try {
    const response = await fetch(`${SEMAPHORE_API_URL}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        success: false,
        error: `Semaphore ${endpoint} API error ${response.status}: ${responseText.slice(0, 200)}`,
      };
    }

    let messageId = "";
    try {
      const data = JSON.parse(responseText);
      const msg = Array.isArray(data) ? data[0] : data;
      messageId = String(msg?.message_id ?? msg?.id ?? "");
    } catch {
      // Non-JSON response — message still sent
    }

    return { success: true, messageId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown SMS error",
    };
  }
}

/**
 * Truncates a message to fit within a single SMS credit (160 chars).
 * Appends "…" if truncated.
 */
export function truncateSms(message: string, max = 160): string {
  if (message.length <= max) return message;
  return message.slice(0, max - 1) + "…";
}
