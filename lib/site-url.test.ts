import { afterEach, describe, expect, it, vi } from "vitest";

import { getSiteUrl } from "./site-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSiteUrl", () => {
  it("uses the configured deployed URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");

    expect(getSiteUrl()).toBe("https://app.example.com");
  });

  it("rejects localhost in production and uses the Vercel production URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "service-flow.vercel.app");

    expect(getSiteUrl()).toBe("https://service-flow.vercel.app");
  });

  it("allows localhost during local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    expect(getSiteUrl()).toBe("http://localhost:3000");
  });
});
