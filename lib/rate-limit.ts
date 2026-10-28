type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
  namespace?: string;
  onStoreError?: "allow" | "deny" | "memory";
};

const trackers = new Map<string, { count: number; expiresAt: number }>();

type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function hasUpstashConfig() {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}

function buildResult(
  count: number,
  maxRequests: number,
  reset: number,
): RateLimitResult {
  return {
    success: count <= maxRequests,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - count),
    reset,
  };
}

function runInMemoryRateLimit(
  key: string,
  config: Required<RateLimitConfig>,
): RateLimitResult {
  const now = Date.now();
  const tracker = trackers.get(key) || {
    count: 0,
    expiresAt: now + config.windowMs,
  };

  if (now > tracker.expiresAt) {
    tracker.count = 1;
    tracker.expiresAt = now + config.windowMs;
  } else {
    tracker.count++;
  }

  trackers.set(key, tracker);

  // Periodic cleanup (simple optimization)
  if (Math.random() < 0.01) {
    cleanup(now);
  }

  return buildResult(tracker.count, config.maxRequests, tracker.expiresAt);
}

async function runUpstashRateLimit(
  key: string,
  config: Required<RateLimitConfig>,
): Promise<RateLimitResult> {
  const now = Date.now();
  const redisKey = `${config.namespace}:${key}`;
  const upstashUrl = UPSTASH_URL as string;
  const upstashToken = UPSTASH_TOKEN as string;

  const response = await fetch(`${upstashUrl}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${upstashToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["PEXPIRE", redisKey, config.windowMs, "NX"],
      ["PTTL", redisKey],
    ]),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Upstash rate-limit request failed (${response.status})`);
  }

  const payload = (await response.json()) as Array<{
    result: unknown;
    error?: string;
  }>;

  const count = Number(payload?.[0]?.result);
  const ttl = Number(payload?.[2]?.result);

  if (!Array.isArray(payload) || payload.some((entry) => entry?.error) ||
      !Number.isFinite(count) || count < 1 || !Number.isFinite(ttl) || ttl <= 0) {
    throw new Error("Invalid rate-limit store response");
  }

  const safeCount = Number.isFinite(count) && count > 0 ? count : 1;
  const safeTtl =
    Number.isFinite(ttl) && ttl > 0 ? ttl : config.windowMs;

  return buildResult(safeCount, config.maxRequests, now + safeTtl);
}

export async function rateLimit(
  key: string,
  config: RateLimitConfig = {
    windowMs: 60 * 1000,
    maxRequests: 100,
    onStoreError: "memory",
  },
) {
  const mergedConfig: Required<RateLimitConfig> = {
    windowMs: config.windowMs,
    maxRequests: config.maxRequests,
    namespace: config.namespace || "service-flow:rate-limit",
    onStoreError: config.onStoreError || "memory",
  };

  if (hasUpstashConfig()) {
    try {
      return await runUpstashRateLimit(key, mergedConfig);
    } catch {
      if (mergedConfig.onStoreError === "deny") {
        return {
          success: false,
          limit: mergedConfig.maxRequests,
          remaining: 0,
          reset: Date.now() + mergedConfig.windowMs,
        };
      }

      if (mergedConfig.onStoreError === "allow") {
        return {
          success: true,
          limit: mergedConfig.maxRequests,
          remaining: mergedConfig.maxRequests,
          reset: Date.now() + mergedConfig.windowMs,
        };
      }

      return runInMemoryRateLimit(key, mergedConfig);
    }
  }

  return runInMemoryRateLimit(key, mergedConfig);
}

function cleanup(now: number) {
  for (const [key, value] of trackers.entries()) {
    if (now > value.expiresAt) {
      trackers.delete(key);
    }
  }
}
