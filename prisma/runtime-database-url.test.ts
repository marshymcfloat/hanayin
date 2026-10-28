import { describe, expect, it } from "vitest";

import { getRuntimeDatabaseUrl } from "./runtime-database-url";

describe("getRuntimeDatabaseUrl", () => {
  it("uses the dedicated direct database in development", () => {
    expect(
      getRuntimeDatabaseUrl({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://production",
        DIRECT_DATABASE_URL: "postgres://development",
      }),
    ).toBe("postgres://development");
  });

  it("does not fall back to the production database in development", () => {
    expect(() =>
      getRuntimeDatabaseUrl({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://production",
      }),
    ).toThrow("DIRECT_DATABASE_URL is required for local development.");
  });

  it("uses DATABASE_URL in production", () => {
    expect(
      getRuntimeDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://production",
        DIRECT_DATABASE_URL: "postgres://development",
      }),
    ).toBe("postgres://production");
  });
});
