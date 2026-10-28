import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/prisma/generated/prisma/client";
const mocks = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("@/prisma/prisma", () => ({ prisma: { availedService: { findFirst: mocks.find } } }));
import { isAvailedServiceOverlapViolation, findAvailedServiceScheduleConflict, scheduleConflictResult } from "@/features/bookings/services/availed-service-overlap";

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
  it("terminates cyclic causes and traverses object wrappers safely", () => {
    const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
    expect(isAvailedServiceOverlapViolation(cycle)).toBe(false);
    expect(isAvailedServiceOverlapViolation({ cause: new Error("AvailedService_owner_no_overlap_excl") })).toBe(true);
  });
});

describe("tenant scoped transactional overlap diagnostics", () => {
  const input = { businessSlug: "tenant-a", serviceId: 12, providerType: "OWNER" as const, providerId: 7 };
  const start = new Date("2026-09-18T04:00:00Z"), end = new Date("2026-09-18T05:00:00Z");
  beforeEach(() => { vi.resetAllMocks(); });
  it.each([{ target: null }, { target: { scheduled_at: null, estimated_end: end } }, { target: { scheduled_at: start, estimated_end: null } }])("does not search when the schedule is absent %j", async ({ target }) => {
    mocks.find.mockResolvedValue(target);
    expect(await findAvailedServiceScheduleConflict(input)).toBeNull(); expect(mocks.find).toHaveBeenCalledTimes(1);
  });
  it.each([{ conflict: null }, { conflict: { scheduled_at: null } }])("returns no conflict for missing diagnostics %j", async ({ conflict }) => {
    mocks.find.mockResolvedValueOnce({ scheduled_at: start, estimated_end: end }).mockResolvedValueOnce(conflict);
    expect(await findAvailedServiceScheduleConflict(input)).toBeNull();
  });
  it.each(["OWNER", "EMPLOYEE"] as const)("keeps legacy %s lookup on the default connection", async providerType => {
    mocks.find.mockResolvedValueOnce({ scheduled_at: start, estimated_end: end }).mockResolvedValueOnce({ scheduled_at: start, service: { name: "Other" } });
    expect(await findAvailedServiceScheduleConflict({ ...input, providerType })).toEqual({ serviceName: "Other", scheduledAt: start });
    expect(mocks.find.mock.calls[0][0]).toEqual({ where: { id: 12, booking: { business: { slug: "tenant-a" } } }, select: { scheduled_at: true, estimated_end: true } });
    expect(mocks.find.mock.calls[1][0]).toEqual({ where: { id: { not: 12 }, booking: { business: { slug: "tenant-a" } }, ...(providerType === "OWNER" ? { served_by_owner_id: 7 } : { served_by_id: 7 }), status: { not: "CANCELLED" }, cancelled_at: null, scheduled_at: { lt: end }, estimated_end: { gt: start } }, orderBy: { scheduled_at: "asc" }, select: { scheduled_at: true, service: { select: { name: true } } } });
  });
  it("adds the verified scope to both queries on the supplied transaction, never the root connection", async () => {
    const find = vi.fn().mockResolvedValueOnce({ scheduled_at: start, estimated_end: end }).mockResolvedValueOnce({ scheduled_at: start, service: { name: "Other" } });
    const scope = { booking: { business_id: "biz-a", business: { owners: { some: { id: 7, user_id: "user-a", user: { role: "OWNER" as const } } } } }, service: { business_id: "biz-a" } };
    expect(await findAvailedServiceScheduleConflict(input, { availedService: { findFirst: find } } as unknown as Parameters<typeof findAvailedServiceScheduleConflict>[1], scope)).toEqual({ serviceName: "Other", scheduledAt: start });
    for (const [query] of find.mock.calls) expect(query.where.AND).toEqual([scope]);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("preserves generic and ISO timestamp conflict result contracts", () => {
    expect(scheduleConflictResult()).not.toHaveProperty("conflict");
    expect(scheduleConflictResult({ serviceName: "Other", scheduledAt: start })).toMatchObject({ success: false, code: "SCHEDULE_CONFLICT", conflict: { serviceName: "Other", scheduledAt: start.toISOString() } });
  });
});
