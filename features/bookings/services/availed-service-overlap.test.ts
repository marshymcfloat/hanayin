import { describe, expect, it } from "vitest";
import { Prisma } from "@/prisma/generated/prisma/client";
import { isAvailedServiceOverlapViolation } from "./availed-service-overlap";

/**
 * The exclusion-constraint behavior itself can only be exercised
 * against a real Postgres instance (out of unit-test scope), but the
 * Prisma-error → SLOT_JUST_TAKEN classifier IS pure logic and worth
 * pinning. Lightweight failures here would mean concurrent-booking
 * collisions surface as "Failed to create booking" instead of the
 * helpful "slot just taken" recovery flow.
 */
describe("isAvailedServiceOverlapViolation", () => {
  it("matches the employee overlap constraint by name", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'duplicate key conflict on constraint "AvailedService_employee_no_overlap_excl"',
      { code: "P2010", clientVersion: "test" },
    );
    expect(isAvailedServiceOverlapViolation(err)).toBe(true);
  });

  it("matches the owner overlap constraint by name", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'EXCLUDE constraint "AvailedService_owner_no_overlap_excl" violated',
      { code: "P2010", clientVersion: "test" },
    );
    expect(isAvailedServiceOverlapViolation(err)).toBe(true);
  });

  it("matches when surfaced as PrismaClientUnknownRequestError (older versions)", () => {
    const err = new Prisma.PrismaClientUnknownRequestError(
      'EXCLUDE: AvailedService_employee_no_overlap_excl',
      { clientVersion: "test" },
    );
    expect(isAvailedServiceOverlapViolation(err)).toBe(true);
  });

  it("matches Prisma 7 DriverAdapterError messages", () => {
    class DriverAdapterError extends Error {}
    const err = new DriverAdapterError(
      'conflicting key value violates exclusion constraint "AvailedService_employee_no_overlap_excl"',
    );

    expect(isAvailedServiceOverlapViolation(err)).toBe(true);
  });

  it("matches an overlap constraint in a nested cause", () => {
    const cause = new Error(
      'constraint "AvailedService_owner_no_overlap_excl" violated',
    );
    const err = new Error("Database request failed", { cause });

    expect(isAvailedServiceOverlapViolation(err)).toBe(true);
  });

  it("does not match unrelated Prisma errors (e.g. unique-constraint)", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: ("email")',
      { code: "P2002", clientVersion: "test" },
    );
    expect(isAvailedServiceOverlapViolation(err)).toBe(false);
  });

  it("does not match plain Errors or unrelated objects", () => {
    expect(isAvailedServiceOverlapViolation(new Error("boom"))).toBe(false);
    expect(isAvailedServiceOverlapViolation("string error")).toBe(false);
    expect(isAvailedServiceOverlapViolation(undefined)).toBe(false);
    expect(isAvailedServiceOverlapViolation(null)).toBe(false);
    expect(isAvailedServiceOverlapViolation({ message: "AvailedService_employee_no_overlap_excl" })).toBe(false);
  });
});
