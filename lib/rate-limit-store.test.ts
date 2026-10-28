import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("rate-limit store failures", () => {
  it.each([
    [{ error: "ERR", result: null }, { result: 1 }, { result: 1000 }],
    [{ result: "invalid" }, { result: 1 }, { result: 1000 }],
    [{ result: 1 }, { result: 1 }, { result: -1 }],
    [],
    {},
  ])("fails closed on malformed/error pipeline response: %j", async (payload) => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "unit-test-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    const { rateLimit } = await import("./rate-limit");
    expect(await rateLimit("otp-verify:test", { windowMs: 600000, maxRequests: 5, onStoreError: "deny" })).toMatchObject({ success: false, remaining: 0 });
  });

  it("fails closed on network failure", async () => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "unit-test-token");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider failure")));
    const { rateLimit } = await import("./rate-limit");
    expect(await rateLimit("otp-verify:test", { windowMs: 600000, maxRequests: 5, onStoreError: "deny" })).toMatchObject({ success: false });
  });

  it("enforces the phone attempt cap with the isolated local store", async () => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { rateLimit } = await import("./rate-limit");
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await rateLimit("otp-verify:phone:test", { windowMs: 600000, maxRequests: 5 })).success).toBe(true);
    }
    expect((await rateLimit("otp-verify:phone:test", { windowMs: 600000, maxRequests: 5 })).success).toBe(false);
  });
});
