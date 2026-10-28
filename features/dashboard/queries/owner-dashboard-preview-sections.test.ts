import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantActorContext } from "@/lib/auth/staff-access";

const mocks = vi.hoisted(() => ({
  pendingQueue: vi.fn(),
  claimedQueue: vi.fn(),
  completedQueue: vi.fn(),
  entitlements: vi.fn(),
  opportunities: vi.fn(),
}));

vi.mock("@/features/dashboard/queries/service-queues", () => ({
  getTenantPendingServiceQueue: mocks.pendingQueue,
  getTenantOwnerClaimedServiceQueue: mocks.claimedQueue,
  getTenantOwnerRecentlyCompletedServiceQueue: mocks.completedQueue,
}));
vi.mock("@/features/billing/plan-entitlements", () => ({
  getBusinessEntitlementsBySlug: mocks.entitlements,
}));
vi.mock("@/lib/services/growth/opportunities", () => ({
  getTodayOpportunityViews: mocks.opportunities,
}));

import {
  getOwnerDashboardFinancialRange,
  getOwnerDashboardGrowth,
  getOwnerDashboardPerformance,
  getOwnerDashboardQueue,
  getOwnerDashboardToday,
} from "./owner-dashboard-preview-sections";

const context = {
  success: true,
  actorType: "OWNER",
  ownerId: 7,
  businessId: "tenant-one",
  businessSlug: "beautyfeel",
  userId: "owner-one",
} as Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;
const now = new Date("2026-09-23T04:00:00.000Z");

function createDatabase() {
  return {
    business: { findFirst: vi.fn().mockResolvedValue({ name: "BeautyFeel" }) },
    booking: { findMany: vi.fn().mockResolvedValue([]) },
    availedService: { findMany: vi.fn().mockResolvedValue([]) },
    expense: { findMany: vi.fn().mockResolvedValue([]) },
    payslip: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("owner dashboard section reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendingQueue.mockResolvedValue([]);
    mocks.claimedQueue.mockResolvedValue([]);
    mocks.completedQueue.mockResolvedValue([]);
    mocks.entitlements.mockResolvedValue({ growth: false });
    mocks.opportunities.mockResolvedValue([]);
  });

  it("denies revoked membership before any protected section read", async () => {
    const db = createDatabase();
    db.business.findFirst.mockResolvedValue(null);
    await expect(getOwnerDashboardQueue(context, { db: db as never, now })).resolves.toBeNull();
    expect(db.business.findFirst).toHaveBeenCalledWith({
      where: {
        id: context.businessId,
        slug: context.businessSlug,
        owners: { some: { id: context.ownerId, business_id: context.businessId, user_id: context.userId, user: { role: "OWNER" } } },
      },
      select: { name: true },
    });
    expect(mocks.pendingQueue).not.toHaveBeenCalled();
    expect(mocks.claimedQueue).not.toHaveBeenCalled();
    expect(mocks.completedQueue).not.toHaveBeenCalled();
    expect(db.booking.findMany).not.toHaveBeenCalled();
  });

  it("refreshes queue with queue reads only", async () => {
    const db = createDatabase();
    const result = await getOwnerDashboardQueue(context, { db: db as never, now });
    expect(result).toEqual({ generatedAt: now.toISOString(), queue: [] });
    expect(mocks.pendingQueue).toHaveBeenCalledWith(context, { take: 20 });
    expect(mocks.claimedQueue).toHaveBeenCalledWith(context, { take: 20 });
    expect(mocks.completedQueue).toHaveBeenCalledWith(context, { take: 20, since: expect.any(Date) });
    expect(db.booking.findMany).not.toHaveBeenCalled();
    expect(db.availedService.findMany).not.toHaveBeenCalled();
    expect(db.expense.findMany).not.toHaveBeenCalled();
    expect(db.payslip.findMany).not.toHaveBeenCalled();
    expect(mocks.entitlements).not.toHaveBeenCalled();
  });

  it("keeps claimed and completed rows visible behind a full pending queue", async () => {
    const booking = { customer: { name: "Guest" }, scheduled_at: now };
    mocks.pendingQueue.mockResolvedValue(Array.from({ length: 20 }, (_, index) => ({
      id: index + 1, price: 100, scheduled_at: now,
      package: null, service: { name: "Service" }, booking,
    })));
    mocks.claimedQueue.mockResolvedValue([{
      id: 21, final_price: 90, status: "CLAIMED", scheduled_at: now,
      package: null, service: { name: "Claimed" }, booking,
    }]);
    mocks.completedQueue.mockResolvedValue([{
      id: 22, final_price: 80, scheduled_at: now,
      package: null, service: { name: "Completed" }, booking,
    }]);

    const result = await getOwnerDashboardQueue(context, { db: createDatabase() as never, now });
    expect(result?.queue).toHaveLength(22);
    expect(result?.queue.slice(-2)).toMatchObject([
      { id: 21, status: "CLAIMED", price: 90 },
      { id: 22, status: "COMPLETED", price: 80 },
    ]);
  });

  it("reads today's bookings without analytics, queue, or growth", async () => {
    const db = createDatabase();
    const result = await getOwnerDashboardToday(context, { db: db as never, now });
    expect(result).toEqual({ generatedAt: now.toISOString(), bookings: [] });
    expect(db.booking.findMany).toHaveBeenCalledOnce();
    expect(db.booking.findMany.mock.calls[0][0].where.business_id).toBe(context.businessId);
    expect(db.availedService.findMany).not.toHaveBeenCalled();
    expect(db.expense.findMany).not.toHaveBeenCalled();
    expect(mocks.pendingQueue).not.toHaveBeenCalled();
  });

  it("reads only current and previous month for performance and computes only month chart", async () => {
    const db = createDatabase();
    const result = await getOwnerDashboardPerformance(context, { db: db as never, now });
    expect(result?.financials.month.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result).not.toHaveProperty("financials.1y");
    expect(result).not.toHaveProperty("bookings");
    expect(result).not.toHaveProperty("queue");
    expect(db.availedService.findMany.mock.calls[0][0].where.completed_at.gte).toEqual(new Date("2026-07-31T16:00:00.000Z"));
    expect(mocks.pendingQueue).not.toHaveBeenCalled();
    expect(mocks.entitlements).not.toHaveBeenCalled();
  });

  it("fetches only the requested financial horizon with narrow columns", async () => {
    const db = createDatabase();
    const result = await getOwnerDashboardFinancialRange(context, "1y", { db: db as never, now });
    expect(result?.range).toBe("1y");
    expect(result?.points).toHaveLength(12);
    expect(db.availedService.findMany.mock.calls[0][0].where.completed_at.gte).toEqual(new Date("2025-09-30T16:00:00.000Z"));
    expect(db.availedService.findMany.mock.calls[0][0].select).toEqual({ final_price: true, completed_at: true });
    expect(db.booking.findMany).not.toHaveBeenCalled();
    expect(mocks.pendingQueue).not.toHaveBeenCalled();
    expect(mocks.entitlements).not.toHaveBeenCalled();
  });

  it("serializes growth opportunity as JSON-safe strings", async () => {
    const db = createDatabase();
    mocks.entitlements.mockResolvedValue({ growth: true });
    mocks.opportunities.mockResolvedValue([{ id: "opp-1", reason: "Open time", confidence: 0.8, timeWindowStart: "09:00", timeWindowEnd: "11:00", recommendedOfferTypes: ["discount"] }]);
    const result = await getOwnerDashboardGrowth(context, { db: db as never, now });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result?.growth.opportunity?.id).toBe("opp-1");
    expect(db.booking.findMany).not.toHaveBeenCalled();
    expect(db.availedService.findMany).not.toHaveBeenCalled();
  });
});
