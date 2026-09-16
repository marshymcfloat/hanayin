import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), business: vi.fn(), actor: vi.fn(), count: vi.fn(),
  bookings: vi.fn(), services: vi.fn(), conflicts: vi.fn(), queue: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireTenantAccess: mocks.auth }));
vi.mock("@/lib/data/cached", () => ({ getCachedBusinessBySlug: mocks.business }));
vi.mock("@/lib/auth/staff-access", () => ({ resolveTenantActorContext: mocks.actor }));
vi.mock("@/features/payments/actions/manual-gcash", () => ({ getGcashVerificationQueueAction: mocks.queue }));
vi.mock("@/prisma/prisma", () => ({ prisma: {
  $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  booking: { count: mocks.count, findMany: mocks.bookings },
  service: { findMany: mocks.services }, outboxMessage: { findMany: mocks.conflicts },
} }));

import { getBookingsWorkspaceData } from "@/features/bookings/queries/workspace";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ success: true, session: { user: { id: "user-1" } } });
  mocks.business.mockResolvedValue({ id: "tenant-1" });
  mocks.actor.mockResolvedValue({ success: true, actorType: "EMPLOYEE" });
  mocks.count.mockResolvedValue(0);
  mocks.bookings.mockResolvedValue([]);
  mocks.services.mockResolvedValue([]);
});

describe("booking workspace", () => {
  it("rejects denied tenant access before reading data", async () => {
    mocks.auth.mockResolvedValue({ success: false });
    expect(await getBookingsWorkspaceData("other", {})).toBeNull();
    expect(mocks.business).not.toHaveBeenCalled();
    expect(mocks.bookings).not.toHaveBeenCalled();
  });

  it("normalizes invalid filters and scopes the count and page to the tenant", async () => {
    const result = await getBookingsWorkspaceData("tenant", { status: "INVALID", page: "-1", open: "bad" });
    expect(result).toMatchObject({ status: "ALL", currentPage: 1, pageSize: 50, initialOpenBookingId: null });
    expect(mocks.count).toHaveBeenCalledWith({ where: { business_id: "tenant-1" } });
    expect(mocks.bookings).toHaveBeenCalledWith(expect.objectContaining({ where: { business_id: "tenant-1" }, skip: 0, take: 50 }));
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it("maps owner queues and tenant-scoped conflict signals with pagination", async () => {
    mocks.actor.mockResolvedValue({ success: true, actorType: "OWNER" });
    mocks.bookings.mockResolvedValue([{ id: 12 }]);
    mocks.count.mockResolvedValue(51);
    mocks.conflicts.mockResolvedValue([{ aggregate_id: "12" }, { aggregate_id: "invalid" }]);
    mocks.queue.mockResolvedValue({ success: true, verificationItems: [{ id: 1 }], followUpItems: [] });
    const result = await getBookingsWorkspaceData("tenant", { page: "2", status: "HOLD", q: " 12 ", open: "12" });
    expect(result).toMatchObject({ currentPage: 2, searchTerm: "12", initialOpenBookingId: 12, totalBookings: 51, staffingConflictBookingIds: [12], verificationItems: [{ id: 1 }] });
    expect(mocks.bookings).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, where: expect.objectContaining({ business_id: "tenant-1", status: "HOLD" }) }));
    expect(mocks.conflicts).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ business_id: "tenant-1", aggregate_id: { in: ["12"] } }) }));
    expect(mocks.queue).toHaveBeenCalledWith("tenant");
  });
});
