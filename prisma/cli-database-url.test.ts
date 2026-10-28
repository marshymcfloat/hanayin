import { describe, expect, it } from "vitest";

import { getPrismaCliDatabaseUrl } from "./cli-database-url";

describe("getPrismaCliDatabaseUrl", () => {
  it("uses the explicit direct database", () => {
    expect(
      getPrismaCliDatabaseUrl({
        DIRECT_DATABASE_URL: "postgres://development",
      }),
    ).toBe("postgres://development");
  });

  it("fails closed when the direct database is missing", () => {
    expect(() => getPrismaCliDatabaseUrl({})).toThrow(
      "Refusing to fall back to DATABASE_URL.",
    );
  });

  it("fails closed when the direct database is blank", () => {
    expect(() =>
      getPrismaCliDatabaseUrl({ DIRECT_DATABASE_URL: "   " }),
    ).toThrow("DIRECT_DATABASE_URL is required");
  });
});
