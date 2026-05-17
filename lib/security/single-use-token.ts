/**
 * Single-use guard for short-lived tokens (jti redemption tracking).
 *
 * Backed by Upstash Redis when configured (matches rate-limit.ts). Falls back
 * to an in-memory Map for local dev. Each `consumeJti` call is atomic SETNX:
 * the first call returns true, every subsequent call returns false until the
 * TTL elapses.
 *
 * Used by `verifyOnboardingLoginToken` to prevent replay of magic-link
 * tokens within their 1-hour validity window.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

type MemoryEntry = { expiresAt: number };
const memoryStore = new Map<string, MemoryEntry>();

function memoryConsumeJti(jti: string, ttlSeconds: number): boolean {
  const now = Date.now();
  const existing = memoryStore.get(jti);
  if (existing && existing.expiresAt > now) return false;
  memoryStore.set(jti, { expiresAt: now + ttlSeconds * 1000 });
  if (Math.random() < 0.01) {
    for (const [key, entry] of memoryStore.entries()) {
      if (entry.expiresAt <= now) memoryStore.delete(key);
    }
  }
  return true;
}

async function upstashConsumeJti(
  jti: string,
  ttlSeconds: number,
): Promise<boolean> {
  const url = UPSTASH_URL as string;
  const token = UPSTASH_TOKEN as string;
  const key = `service-flow:jti:${jti}`;

  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([["SET", key, "1", "NX", "EX", ttlSeconds]]),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Upstash consumeJti failed (${response.status})`);
  }
  const payload = (await response.json()) as Array<{ result: unknown }>;
  // SET ... NX returns "OK" on success, null when the key already exists.
  return payload?.[0]?.result === "OK";
}

/**
 * Mark a jti as consumed. Returns true if this is the first consumption
 * (token is still fresh), false if it has already been consumed inside the
 * TTL window.
 *
 * On Upstash failure we fall back to in-memory tracking — best-effort, since
 * a network blip should not lock legitimate users out of their magic link.
 */
export async function consumeJti(
  jti: string,
  ttlSeconds: number,
): Promise<boolean> {
  if (!jti || ttlSeconds <= 0) return false;
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      return await upstashConsumeJti(jti, ttlSeconds);
    } catch {
      return memoryConsumeJti(jti, ttlSeconds);
    }
  }
  return memoryConsumeJti(jti, ttlSeconds);
}

/** @internal — test-only reset. */
export function __resetSingleUseTokenStoreForTests() {
  memoryStore.clear();
}
