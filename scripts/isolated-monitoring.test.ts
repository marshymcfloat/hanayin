// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const monitoring = vi.hoisted(() => ({ init: vi.fn(), wrap: vi.fn((config: unknown, options: unknown) => ({ config, options })) }));
vi.mock("@sentry/nextjs", () => ({ init: monitoring.init }));
vi.mock("@sentry/nextjs/config", () => ({ withSentryConfig: monitoring.wrap }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe.each(["server", "edge"] as const)("%s monitoring isolation", runtime => {
  async function load() {
    if (runtime === "server") await import("@/sentry.server.config");
    else await import("@/sentry.edge.config");
  }
  it("does not initialize delivery for isolated production verification", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("TEST_DATABASE_DISPOSABLE", "1");
    await load(); expect(monitoring.init).not.toHaveBeenCalled();
  });
  it("preserves normal production monitoring", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("TEST_DATABASE_DISPOSABLE", "");
    await load(); expect(monitoring.init).toHaveBeenCalledOnce();
  });
  it("preserves development isolation", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("TEST_DATABASE_DISPOSABLE", "");
    await load(); expect(monitoring.init).not.toHaveBeenCalled();
  });
});

describe("build monitoring isolation", () => {
  it("does not invoke the credential-loading plugin during isolated production verification", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("TEST_DATABASE_DISPOSABLE", "1");
    await import("@/next.config"); expect(monitoring.wrap).not.toHaveBeenCalled();
  });
  it("preserves the normal production wrapper", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("TEST_DATABASE_DISPOSABLE", "");
    await import("@/next.config");
    expect(monitoring.wrap).toHaveBeenCalledOnce();
    expect(monitoring.wrap.mock.calls[0][1]).toMatchObject({ org: "daniel-q7", project: "serviceflow", tunnelRoute: "/monitoring" });
  });
  it("keeps development builds unwrapped", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("TEST_DATABASE_DISPOSABLE", "1");
    await import("@/next.config"); expect(monitoring.wrap).not.toHaveBeenCalled();
  });
});
