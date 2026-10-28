// @vitest-environment node
import { describe, expect, it } from "vitest";
import { types } from "pg";
import { createFixtureDatabaseClient } from "./e2e-database";

describe("fixture-only UTC timestamp parser", () => {
  it("reads Prisma timestamp values as UTC without changing global pg parsers", () => {
    const original = types.getTypeParser(1114, "text");
    const client = createFixtureDatabaseClient("postgresql://fixture:fixture@127.0.0.1:1/test");
    expect(client.getTypeParser(1114, "text")("2030-01-15 01:02:03.456")).toEqual(new Date("2030-01-15T01:02:03.456Z"));
    expect(types.getTypeParser(1114, "text")).toBe(original);
  });
  it("preserves ordinary numeric and timezone-aware timestamp parsing", () => {
    const client = createFixtureDatabaseClient("postgresql://fixture:fixture@127.0.0.1:1/test");
    expect(client.getTypeParser(23, "text")("42")).toBe(42);
    expect(client.getTypeParser(1184, "text")("2030-01-15 09:00:00+08")).toEqual(new Date("2030-01-15T01:00:00Z"));
  });
});
