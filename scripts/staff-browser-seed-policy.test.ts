import { describe, expect, it } from "vitest";
import { classifyStaffSeedTarget } from "./staff-browser-seed-policy";

describe("staff browser seed target guard", () => {
  const target = { databaseName: "postgres", providerProjectFingerprint: "a".repeat(64) };

  it("rejects every target without independent approval", () => {
    expect(classifyStaffSeedTarget(target)).toEqual({ allowed: false, classification: "unverified" });
  });

  it("rejects mismatched project or database identity", () => {
    expect(classifyStaffSeedTarget(target, { databaseName: "service-flow-test", providerProjectFingerprint: target.providerProjectFingerprint, environment: "test" }).allowed).toBe(false);
    expect(classifyStaffSeedTarget(target, { databaseName: "postgres", providerProjectFingerprint: "b".repeat(64), environment: "development" }).allowed).toBe(false);
  });

  it("rejects production claims, protected names, and incomplete identities", () => {
    expect(classifyStaffSeedTarget(target, { ...target, environment: "production" }).allowed).toBe(false);
    expect(classifyStaffSeedTarget({ ...target, databaseName: "service-flow-production" }, { ...target, databaseName: "service-flow-production", environment: "development" }).allowed).toBe(false);
    expect(classifyStaffSeedTarget({ ...target, databaseName: "" }, { ...target, databaseName: "", environment: "test" }).allowed).toBe(false);
    expect(classifyStaffSeedTarget({ ...target, providerProjectFingerprint: "" }, { ...target, providerProjectFingerprint: "", environment: "development" }).allowed).toBe(false);
  });

  it("accepts a project and database explicitly confirmed as development", () => {
    expect(classifyStaffSeedTarget(target, { ...target, environment: "development" })).toEqual({
      allowed: true,
      classification: "development",
    });
  });
});
