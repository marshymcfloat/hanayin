import { describe, expect, it } from "vitest";
import { requireTestDatabase } from "./test-database-target.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";

describe("disposable test database guard", () => {
  it("never falls back to shared application or E2E database URLs", () => {
    expect(() => requireTestDatabase({
      DATABASE_URL: "postgresql://localhost/service-flow-dev",
      DIRECT_DATABASE_URL: "postgresql://localhost/service-flow-dev",
      E2E_DATABASE_URL: "postgresql://localhost/service-flow-dev",
    })).toThrow("TEST_DATABASE_URL");
  });
  it("requires an explicit disposable acknowledgement", () => {
    expect(() => requireTestDatabase({ TEST_DATABASE_URL: "postgresql://localhost/service-flow-test" })).toThrow("TEST_DATABASE_DISPOSABLE");
  });
  it.each(["prisma+postgres://example/test", "not-a-url", "https://example/test", "postgresql://localhost/"])("rejects invalid/direct-protocol target %s", (url) => {
    expect(() => requireTestDatabase({ TEST_DATABASE_URL: url, TEST_DATABASE_DISPOSABLE: "1" })).toThrow();
  });
  it.each(["service-flow-dev", "service_flow_staging", "production", "service-flow-prod"])("rejects known unsafe database names %s", (database) => {
    expect(() => requireTestDatabase({ TEST_DATABASE_URL: "postgresql://localhost/" + database, TEST_DATABASE_DISPOSABLE: "1" })).toThrow("Refusing");
  });
  it("accepts an explicitly verified dedicated test target", () => {
    const url = "postgresql://localhost/service-flow-test";
    expect(requireTestDatabase({ TEST_DATABASE_URL: url, TEST_DATABASE_DISPOSABLE: "1" })).toBe(url);
  });
  it("does not expose credentials from an invalid target", () => {
    expect(() => requireTestDatabase({ TEST_DATABASE_URL: "https://secret:password@example/prod", TEST_DATABASE_DISPOSABLE: "1" })).toThrow("direct PostgreSQL");
  });
  it("blocks the actual runner before loading tests or connecting", () => {
    const result = spawnSync(process.execPath, [path.resolve("scripts/run-database-tests.mjs"), "integration"], {
      encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DIRECT_DATABASE_URL: "postgresql://localhost/service-flow-dev" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("TEST_DATABASE_URL");
    expect(result.stdout).not.toContain("RUN");
  });
});
