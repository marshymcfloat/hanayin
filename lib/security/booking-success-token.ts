import crypto from "crypto";

export const BOOKING_SUCCESS_TOKEN_TTL_SECONDS = 30 * 60;
export const BOOKING_DETAILS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
// Manage tokens unlock customer self-serve cancel + reschedule. Same
// 30-day window as details tokens — has to live long enough for the
// booking horizon plus the appointment date itself.
export const BOOKING_MANAGE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export type BookingTokenPurpose = "success" | "details" | "manage";

type BookingSuccessPayload = {
  bookingId: number;
  businessSlug: string;
  purpose: BookingTokenPurpose;
  exp: number;
};

function getTokenSecret() {
  const secret =
    process.env.BOOKING_SUCCESS_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.PAYMONGO_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error(
      "BOOKING_SUCCESS_TOKEN_SECRET (or NEXTAUTH_SECRET) must be configured.",
    );
  }

  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadBase64: string) {
  return crypto
    .createHmac("sha256", getTokenSecret())
    .update(payloadBase64)
    .digest("base64url");
}

export function createBookingSuccessToken(params: {
  bookingId: number;
  businessSlug: string;
  ttlSeconds?: number;
  purpose?: BookingTokenPurpose;
}) {
  const ttlSeconds = params.ttlSeconds ?? BOOKING_SUCCESS_TOKEN_TTL_SECONDS;
  const purpose = params.purpose ?? "success";
  const payload: BookingSuccessPayload = {
    bookingId: params.bookingId,
    businessSlug: params.businessSlug,
    purpose,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function verifyBookingSuccessToken(params: {
  token: string;
  bookingId: number;
  businessSlug: string;
  purpose?: BookingTokenPurpose;
}) {
  const [payloadBase64, signature] = params.token.split(".");
  if (!payloadBase64 || !signature) {
    return false;
  }
  const expectedPurpose = params.purpose ?? "success";

  const expectedSignature = signPayload(payloadBase64);

  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "utf8"),
        Buffer.from(signature, "utf8"),
      )
    ) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    const payload = JSON.parse(
      base64UrlDecode(payloadBase64),
    ) as Partial<BookingSuccessPayload>;
    const tokenPurpose: BookingTokenPurpose =
      payload.purpose === "details"
        ? "details"
        : payload.purpose === "manage"
          ? "manage"
          : "success";

    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return (
      payload.bookingId === params.bookingId &&
      payload.businessSlug === params.businessSlug &&
      tokenPurpose === expectedPurpose
    );
  } catch {
    return false;
  }
}
