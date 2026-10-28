import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { readBoundedProviderJson } from "@/features/social/customer-messaging/worker/provider-response";

const bucketSchema = z.array(z.object({ result: z.number().int(), error: z.never().optional() })).length(9);

/** Shared request budgets bound cost across worker instances; there is no memory fallback. */
export async function takeMessagingModelBudget(businessId: string, now = new Date(), options: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<boolean> {
  const endpoint = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!endpoint || !token || !businessId || businessId.length > 200) return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".upstash.io") || url.username || url.password || url.search || url.hash) return false;
    const tenant = createHash("sha256").update(businessId).digest("hex");
    const day = now.toISOString().slice(0, 10);
    const buckets = [
      { key: `sf:messaging:minute:${tenant}`, ttl: 60_000, limit: 5 },
      { key: `sf:messaging:day:${day}:${tenant}`, ttl: 86_400_000, limit: 200 },
      { key: `sf:messaging:global:${day}`, ttl: 86_400_000, limit: 500 },
    ];
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = async () => {
        const response = await (options.fetch ?? fetch)(`${url.toString().replace(/\/$/, "")}/pipeline`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(buckets.flatMap(bucket => [["INCR", bucket.key], ["PEXPIRE", bucket.key, bucket.ttl, "NX"], ["PTTL", bucket.key]])),
          redirect: "error", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) return false;
        const parsed = bucketSchema.safeParse(await readBoundedProviderJson(response, 4_096));
        return parsed.success && buckets.every((bucket, index) => parsed.data[index * 3].result >= 1
          && parsed.data[index * 3].result <= bucket.limit && parsed.data[index * 3 + 2].result > 0);
      };
      return await Promise.race([request(), new Promise<boolean>(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve(false); }, Math.min(options.timeoutMs ?? 3_000, 3_000));
      })]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch { return false; }
}
