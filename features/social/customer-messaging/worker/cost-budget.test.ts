// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeMessagingModelBudget } from "@/features/social/customer-messaging/worker/cost-budget";

const result = (counts = [1, 1, 1]) => new Response(JSON.stringify(counts.flatMap(count => [{ result: count }, { result: 1 }, { result: 50_000 }])));
beforeEach(() => { vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://synthetic.upstash.io"); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "synthetic-token"); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("distributed model cost budget", () => {
  it("has no local-memory fallback when the shared store is absent", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); const fetch = vi.fn();
    expect(await takeMessagingModelBudget("tenant-a", new Date(), { fetch })).toBe(false); expect(fetch).not.toHaveBeenCalled();
  });
  it("uses tenant minute/day and global day buckets with hashed tenant identity", async () => {
    const fetch = vi.fn().mockResolvedValue(result());
    expect(await takeMessagingModelBudget("tenant-a", new Date("2026-10-05T00:00:00Z"), { fetch })).toBe(true);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toHaveLength(9); expect(JSON.stringify(body)).not.toContain("tenant-a");
    expect(body[6][1]).toBe("sf:messaging:global:2026-10-05");
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
  });
  it.each([{ counts: [6, 1, 1] }, { counts: [1, 201, 1] }, { counts: [1, 1, 501] }])("denies an exhausted request budget", async ({ counts }) => {
    expect(await takeMessagingModelBudget("a", new Date(), { fetch: vi.fn().mockResolvedValue(result(counts)) })).toBe(false);
  });
  it.each(["http://synthetic.upstash.io", "https://evil.test", "https://synthetic.upstash.io?token=bad"])("rejects unsafe store URL %s", async url => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", url); const fetch = vi.fn();
    expect(await takeMessagingModelBudget("a", new Date(), { fetch })).toBe(false); expect(fetch).not.toHaveBeenCalled();
  });
  it("denies malformed/failed store responses and timeout", async () => {
    for (const response of [new Response("[]"), new Response("{}", { status: 503 }), new Response("x".repeat(5000))]) {
      expect(await takeMessagingModelBudget("a", new Date(), { fetch: vi.fn().mockResolvedValue(response) })).toBe(false);
    }
    vi.useFakeTimers();
    const pending = takeMessagingModelBudget("a", new Date(), { fetch: vi.fn().mockImplementation(() => new Promise(() => undefined)), timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100); expect(await pending).toBe(false);
  });
});
