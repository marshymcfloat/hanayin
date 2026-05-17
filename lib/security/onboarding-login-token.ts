import crypto from "crypto";
import { consumeJti } from "./single-use-token";

/**
 * One-time login token for the onboarding magic-link flow.
 *
 * Issued by `convertOnboardingApplicationToBusinessAction` after a
 * platform admin converts an application — sent to the new owner via
 * SMS (primary) + email (fallback). The applicant clicks the link,
 * which lands on `/login/magic`, verifies the token via the
 * NextAuth "magic-link" Credentials provider, and signs them in.
 *
 * Phone-first product semantics — the token is the credential. The
 * admin never has to share a plaintext password through any channel,
 * which removes the existing post-conversion support burden.
 *
 * 1-hour TTL by default. Short window deliberately: applicants who
 * don't redeem in time can request a fresh link from their existing
 * tokenized status page (`/apply/status?token=…`), which has its own
 * 60-day TTL.
 */
const ONBOARDING_LOGIN_TOKEN_TTL_SECONDS = 60 * 60;

export const ONBOARDING_LOGIN_TOKEN_TTL_SECONDS_DEFAULT =
  ONBOARDING_LOGIN_TOKEN_TTL_SECONDS;

export type OnboardingLoginPayload = {
  userId: string;
  applicationId: string;
  exp: number;
  // Random per-token id so we can mark a token as consumed-once and reject
  // replays within the 1-hour validity window.
  jti?: string;
};

function getTokenSecret() {
  const secret =
    process.env.ONBOARDING_LOGIN_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "ONBOARDING_LOGIN_TOKEN_SECRET (or NEXTAUTH_SECRET) must be configured.",
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

export function createOnboardingLoginToken(params: {
  userId: string;
  applicationId: string;
  ttlSeconds?: number;
}) {
  const ttlSeconds = params.ttlSeconds ?? ONBOARDING_LOGIN_TOKEN_TTL_SECONDS;
  const payload: OnboardingLoginPayload = {
    userId: params.userId,
    applicationId: params.applicationId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    jti: crypto.randomBytes(16).toString("base64url"),
  };
  const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

/**
 * Signature + expiry verification only. Use when you need to inspect a token
 * without consuming it (e.g. logging diagnostics). For login flows always go
 * through `consumeOnboardingLoginToken` so replays are rejected.
 */
export function verifyOnboardingLoginToken(
  token: string,
): OnboardingLoginPayload | null {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) return null;

  const expectedSignature = signPayload(payloadBase64);
  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "utf8"),
        Buffer.from(signature, "utf8"),
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(
      base64UrlDecode(payloadBase64),
    ) as OnboardingLoginPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.userId || !payload.applicationId) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Verify and consume a magic-link token. Returns the payload on the first
 * call; subsequent calls within the TTL window return null even though the
 * signature is still valid. Tokens minted before the jti rollout (no `jti`
 * field) are treated as already legacy and accepted once per process.
 */
export async function consumeOnboardingLoginToken(
  token: string,
): Promise<OnboardingLoginPayload | null> {
  const payload = verifyOnboardingLoginToken(token);
  if (!payload) return null;
  const remainingSeconds = Math.max(
    1,
    payload.exp - Math.floor(Date.now() / 1000),
  );
  // Older tokens without a jti can't be tracked uniquely; gate them by
  // userId+exp so an attacker can't replay an old leak twice in the same TTL
  // window. Newer tokens use the random jti.
  const jti = payload.jti ?? `legacy:${payload.userId}:${payload.exp}`;
  const fresh = await consumeJti(jti, remainingSeconds);
  return fresh ? payload : null;
}
