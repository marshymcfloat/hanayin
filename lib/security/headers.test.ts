import { afterEach, describe, expect, it, vi } from "vitest";

async function loadPolicy(nodeEnv: "development" | "production") {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);

  return (await import("./headers")).CONTENT_SECURITY_POLICY;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("CONTENT_SECURITY_POLICY", () => {
  it("allows eval only for React development debugging", async () => {
    const policy = await loadPolicy("development");

    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });

  it("does not allow eval in production", async () => {
    const policy = await loadPolicy("production");

    expect(policy).not.toContain("'unsafe-eval'");
  });
});
