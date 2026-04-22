// Semaphore docs curl examples use semaphore.co/api/v4 (not api.semaphore.co)
const SEMAPHORE_API_URL = "https://semaphore.co/api/v4";

/**
 * Normalizes a Philippine mobile number to the 639XXXXXXXXX format
 * required by the Semaphore API.
 */
export function normalizePhilippinePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, "");

  // Already 639XXXXXXXXX (12 digits, starts with 63)
  if (/^63\d{10}$/.test(cleaned)) return cleaned;

  // 09XXXXXXXXX → 639XXXXXXXXX
  if (/^09\d{9}$/.test(cleaned)) return "63" + cleaned.slice(1);

  // 9XXXXXXXXX (10 digits, starts with 9) → 639XXXXXXXXX
  if (/^9\d{9}$/.test(cleaned)) return "63" + cleaned;

  // Return as-is if we can't normalize — let Semaphore reject it
  return cleaned;
}

export interface SemaphoreOtpResult {
  code: string;
  messageId: string;
}

/**
 * Generates a cryptographically random 6-digit OTP code.
 * We generate the code ourselves and pass it to Semaphore via the `code`
 * parameter so we never depend on parsing it back out of the response.
 */
function generateOtpCode(): string {
  // Use crypto.getRandomValues when available (edge/browser), fall back to
  // Math.random for older Node environments.
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return String(100000 + (buf[0] % 900000));
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Sends an OTP via Semaphore's dedicated /otp endpoint.
 *
 * We generate the code server-side and pass it as the `code` parameter so
 * Semaphore substitutes it into the {otp} placeholder.
 *
 * sendername is intentionally omitted — unregistered sender names can cause
 * silent delivery failures. Omitting it defaults to "SEMAPHORE" which always works.
 */
export async function sendSemaphoreOtp(
  phone: string,
): Promise<SemaphoreOtpResult> {
  const apiKey = process.env.SEMAPHORE_API;
  if (!apiKey) throw new Error("SEMAPHORE_API is not configured");

  const normalizedPhone = normalizePhilippinePhone(phone);
  const code = generateOtpCode();

  const params = new URLSearchParams({
    apikey: apiKey,
    number: normalizedPhone,
    message:
      "Your ServiceFlow booking code is {otp}. Valid for 10 minutes. Do not share this with anyone.",
    code,
  });

  // Append registered sender name only when explicitly configured
  const senderName = process.env.SEMAPHORE_SENDER_NAME;
  if (senderName) params.append("sendername", senderName);

  const response = await fetch(`${SEMAPHORE_API_URL}/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Semaphore OTP API error ${response.status}: ${responseText.slice(0, 300)}`,
    );
  }

  let messageId = "";
  try {
    const data = JSON.parse(responseText);
    const message = Array.isArray(data) ? data[0] : data;
    messageId = String(message?.message_id ?? message?.id ?? "");
  } catch {
    // Non-JSON response — not fatal, we already have our code
  }

  return { code, messageId };
}
