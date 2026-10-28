import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBookingNotesAction } from "./booking-notes-list";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/prisma/prisma", () => ({ prisma: { bookingNote: { findMany: mocks.list } } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, businessSlug: "verified-slug", session: { user: { id: "verified-user" } } });
  mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER", businessId: "verified-business" });
  mocks.list.mockResolvedValue([]);
});

describe("tenant-internal booking notes", () => {
  it.each([0, -1, 1.5, NaN, Infinity, 2147483648, Number.MAX_SAFE_INTEGER])("denies invalid booking ID %s before authorization", async id => {
    expect(await listBookingNotesAction(id)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it.each(["10", null, undefined, {}])("rejects malformed ID input without coercion", async id => {
    expect(await listBookingNotesAction(id as number)).toEqual({ success: false, error: "Invalid input" });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("denies unauthenticated callers and stale memberships before note reads", async () => {
    mocks.auth.mockResolvedValueOnce({ success: false, error: "Unauthorized" });
    expect(await listBookingNotesAction(1)).toEqual({ success: false, error: "Unauthorized" });
    expect(mocks.actor).not.toHaveBeenCalled();
    mocks.actor.mockResolvedValueOnce({ success: false, error: "Forbidden" });
    expect(await listBookingNotesAction(1)).toEqual({ success: false, error: "Forbidden" });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("scopes through the parent booking, caps latest-first results and returns empty inaccessible bookings", async () => {
    expect(await listBookingNotesAction(10)).toEqual({ success: true, notes: [] });
    expect(mocks.actor).toHaveBeenCalledWith("verified-slug", "verified-user");
    expect(mocks.list).toHaveBeenCalledWith({ where: { booking_id: 10, booking: { business_id: "verified-business" } }, select: { id: true, body: true, visibility: true, created_at: true, created_by_user: { select: { id: true, name: true } } }, orderBy: { created_at: "desc" }, take: 100 });
  });

  it("preserves internal/public note display fields, ISO dates and nullable creators", async () => {
    const date = new Date("2026-09-16T01:00:00Z");
    mocks.list.mockResolvedValue([
      { id: "note-1", body: "Fixture allergy", visibility: "INTERNAL", created_at: date, created_by_user: { id: "creator", name: "Fixture", hashed_password: "private-fixture" }, privateField: "private" },
      { id: "note-2", body: "Fixture preference", visibility: "CUSTOMER_VISIBLE", created_at: date, created_by_user: null },
    ]);
    expect(await listBookingNotesAction(10)).toEqual({ success: true, notes: [
      { id: "note-1", body: "Fixture allergy", visibility: "INTERNAL", createdAt: date.toISOString(), createdBy: { id: "creator", name: "Fixture" } },
      { id: "note-2", body: "Fixture preference", visibility: "CUSTOMER_VISIBLE", createdAt: date.toISOString(), createdBy: null },
    ] });
  });

  it.each(["STAFF", "MANAGER", "CASHIER"])("preserves current %s member access to internal booking notes", async profile => {
    mocks.actor.mockResolvedValue({ success: true, actorType: "EMPLOYEE", profile, permissions: [], businessId: "verified-business" });
    expect(await listBookingNotesAction(2147483647)).toEqual({ success: true, notes: [] });
    expect(mocks.list.mock.calls[0][0].where).toEqual({ booking_id: 2147483647, booking: { business_id: "verified-business" } });
  });

  it.each(["auth", "actor", "list"] as const)("returns a safe error for %s infrastructure failures", async target => {
    mocks[target].mockRejectedValue(new Error("private database fixture"));
    expect(await listBookingNotesAction(1)).toEqual({ success: false, error: "Unable to load booking notes." });
    if (target !== "list") expect(mocks.list).not.toHaveBeenCalled();
  });
});
