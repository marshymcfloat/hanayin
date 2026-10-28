import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantActorContext } from "@/lib/auth/staff-access";

const mocks = vi.hoisted(() => ({
  pendingQueue: vi.fn(),
  claimedQueue: vi.fn(),
  entitlements: vi.fn(),
  opportunities: vi.fn(),
  resolveContext: vi.fn(),
}));

vi.mock("@/features/dashboard/queries/service-queues", () => ({
  getTenantPendingServiceQueue: mocks.pendingQueue,
  getTenantOwnerClaimedServiceQueue: mocks.claimedQueue,
}));
vi.mock("@/features/billing/plan-entitlements", () => ({
  getBusinessEntitlementsBySlug: mocks.entitlements,
}));
vi.mock("@/lib/services/growth/opportunities", () => ({
  getTodayOpportunityViews: mocks.opportunities,
}));
vi.mock("@/lib/auth/staff-access", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/staff-access")>();
  return { ...original, resolveTenantActorContext: mocks.resolveContext };
});

import {
  getOwnerDashboardPreviewReadModel,
  resolveOwnerDashboardPreviewReadModel,
} from "./owner-dashboard-preview";

const context = {
  success: true,
  actorType: "OWNER",
  ownerId: 7,
  businessId: "business-1",
  businessSlug: "beautyfeel",
  userId: "owner-user-1",
} as Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;

function createDatabase() {
  return {
    business: { findFirst: vi.fn() },
    booking: { findMany: vi.fn() },
    availedService: { findMany: vi.fn() },
    expense: { findMany: vi.fn() },
    payslip: { findMany: vi.fn() },
  };
}

describe("owner dashboard preview read model", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.pendingQueue.mockResolvedValue([]);
    mocks.claimedQueue.mockResolvedValue([]);
    mocks.entitlements.mockResolvedValue({ growth: false });
    mocks.opportunities.mockResolvedValue([]);
  });

  it("denies a resolved actor that is not an owner", async () => {
    mocks.resolveContext.mockResolvedValue({
      success: true,
      actorType: "EMPLOYEE",
    });

    await expect(
      resolveOwnerDashboardPreviewReadModel("beautyfeel", "employee-user"),
    ).resolves.toBeNull();
  });

  it("fails closed when current owner membership is no longer present", async () => {
    const db = createDatabase();
    db.business.findFirst.mockResolvedValue(null);

    await expect(
      getOwnerDashboardPreviewReadModel(context, {
        db: db as never,
        now: new Date("2026-09-23T04:00:00.000Z"),
      }),
    ).resolves.toBeNull();

    expect(db.business.findFirst).toHaveBeenCalledWith({
      where: {
        id: context.businessId,
        slug: context.businessSlug,
        owners: {
          some: {
            id: context.ownerId,
            business_id: context.businessId,
            user_id: context.userId,
            user: { role: "OWNER" },
          },
        },
      },
      select: { name: true },
    });
    expect(db.booking.findMany).not.toHaveBeenCalled();
    expect(db.availedService.findMany).not.toHaveBeenCalled();
    expect(db.expense.findMany).not.toHaveBeenCalled();
    expect(db.payslip.findMany).not.toHaveBeenCalled();
    expect(mocks.pendingQueue).not.toHaveBeenCalled();
    expect(mocks.claimedQueue).not.toHaveBeenCalled();
    expect(mocks.entitlements).not.toHaveBeenCalled();
    expect(mocks.opportunities).not.toHaveBeenCalled();
  });

  it("maps tenant-scoped operational data without inventing unavailable metrics", async () => {
    const db = createDatabase();
    const now = new Date("2026-09-23T04:00:00.000Z");
    db.business.findFirst.mockResolvedValue({ name: "BeautyFeel" });
    db.booking.findMany
      .mockResolvedValueOnce([
        {
          id: 1,
          status: "COMPLETED",
          grand_total: 1200,
          created_at: new Date("2026-09-05T02:00:00.000Z"),
        },
        {
          id: 2,
          status: "ACCEPTED",
          grand_total: 500,
          created_at: new Date("2026-09-06T02:00:00.000Z"),
        },
        {
          id: 3,
          status: "COMPLETED",
          grand_total: 800,
          created_at: new Date("2026-08-05T02:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 4,
          status: "ACCEPTED",
          scheduled_at: new Date("2026-09-23T02:00:00.000Z"),
          estimated_end: new Date("2026-09-23T03:00:00.000Z"),
          grand_total: 700,
          amount_paid: 200,
          downpayment: 250,
          customer_label: null,
          customer: { name: "Maria Cruz", phone: "09170000000" },
          availed_services: [
            {
              status: "SERVING",
              scheduled_at: new Date("2026-09-23T02:00:00.000Z"),
              service: { name: "Haircut", duration: 60 },
              served_by: {
                business_id: context.businessId,
                user: { name: "Ana Reyes" },
              },
              served_by_owner: null,
            },
          ],
        },
      ]);
    db.availedService.findMany.mockResolvedValue([
      {
        id: 10,
        final_price: 1000,
        completed_at: new Date("2026-09-05T03:00:00.000Z"),
        service_id: 9,
        service: { name: "Haircut" },
        served_by: {
          id: 20,
          business_id: context.businessId,
          profile: "STAFF",
          user: { name: "Ana Reyes" },
        },
        served_by_owner: null,
        booking: {
          id: 1,
          grand_total: 1200,
          customer_id: "customer-1",
          customer: { name: "Maria Cruz" },
        },
      },
      {
        id: 11,
        final_price: 800,
        completed_at: new Date("2026-08-05T03:00:00.000Z"),
        service_id: 9,
        service: { name: "Haircut" },
        served_by: null,
        served_by_owner: {
          id: context.ownerId,
          business_id: context.businessId,
          user: { name: "Owner One" },
        },
        booking: {
          id: 3,
          grand_total: 800,
          customer_id: "customer-2",
          customer: { name: "Older Customer" },
        },
      },
    ]);
    db.expense.findMany.mockResolvedValue([
      {
        amount: 200,
        category: "SUPPLIES",
        date: new Date("2026-09-10T02:00:00.000Z"),
      },
    ]);
    db.payslip.findMany.mockResolvedValue([
      {
        total_salary: 300,
        ending_date: new Date("2026-09-15T02:00:00.000Z"),
      },
    ]);
    mocks.pendingQueue.mockResolvedValue([
      {
        id: 30,
        price: 500,
        scheduled_at: new Date("2026-09-23T05:00:00.000Z"),
        package: null,
        service: { name: "Nails" },
        booking: {
          customer: { name: "Queue Customer" },
          scheduled_at: new Date("2026-09-23T05:00:00.000Z"),
        },
      },
    ]);
    mocks.claimedQueue.mockResolvedValue([
      {
        id: 31,
        final_price: 900,
        status: "CLAIMED",
        scheduled_at: new Date("2026-09-23T06:00:00.000Z"),
        package: { name: "Spa Package" },
        service: { name: "Massage" },
        booking: {
          customer: null,
          scheduled_at: new Date("2026-09-23T06:00:00.000Z"),
        },
      },
    ]);
    mocks.entitlements.mockResolvedValue({ growth: true });
    mocks.opportunities.mockResolvedValue([
      {
        id: "opportunity-1",
        reason: "A quiet afternoon window is available.",
        confidence: 82,
        timeWindowStart: "2026-09-23T06:00:00.000Z",
        timeWindowEnd: "2026-09-23T09:00:00.000Z",
        recommendedOfferTypes: ["LIMITED_SLOTS"],
      },
    ]);

    const result = await getOwnerDashboardPreviewReadModel(context, {
      db: db as never,
      now,
    });

    expect(result).toMatchObject({
      generatedAt: now.toISOString(),
      business: { slug: "beautyfeel", name: "BeautyFeel" },
      kpis: [
        { id: "revenue", value: 1000 },
        { id: "expenses", value: 500 },
        { id: "income", value: 500 },
        { id: "completion", value: 50 },
        { id: "average", value: 1200 },
      ],
      bookings: [
        {
          id: 4,
          customer: "Maria Cruz",
          service: "Haircut",
          staff: "Ana Reyes",
          status: "In service",
          phone: "09170000000",
          duration: "1 hr",
          total: 700,
          deposit: 250,
        },
      ],
      expenseBreakdown: [
        { name: "Team payroll", value: 300, share: 60 },
        { name: "Supplies", value: 200, share: 40 },
      ],
      topServices: [{ name: "Haircut", value: 1000, share: 100 }],
      topCustomers: [{ name: "Maria Cruz", value: 1200, share: 100 }],
      staff: [
        {
          id: "employee:20",
          name: "Ana Reyes",
          role: "Staff",
          bookings: 1,
          revenue: 1000,
          utilization: null,
        },
      ],
      queue: [
        { id: 30, status: "PENDING", service: "Nails", price: 500 },
        {
          id: 31,
          status: "CLAIMED",
          service: "Spa Package",
          customer: "Walk-in",
          price: 900,
        },
      ],
      growth: {
        enabled: true,
        opportunity: {
          id: "opportunity-1",
          confidence: 82,
        },
        occupancy: null,
      },
      availability: {
        staffUtilization: "unavailable",
        growthOccupancy: "unavailable",
      },
    });

    expect(result?.financials["1y"]).toHaveLength(12);
    expect(result?.financials.month[4]).toMatchObject({
      period: "5",
      revenue: 1000,
      expenses: 0,
      cashflow: 1000,
    });
    expect(db.booking.findMany.mock.calls[0][0].where.business_id).toBe(
      context.businessId,
    );
    expect(
      db.booking.findMany.mock.calls[0][0].where.business.owners.some,
    ).toMatchObject({
      id: context.ownerId,
      business_id: context.businessId,
      user_id: context.userId,
    });
    expect(
      db.availedService.findMany.mock.calls[0][0].where.booking.business.owners
        .some,
    ).toMatchObject({
      id: context.ownerId,
      business_id: context.businessId,
      user_id: context.userId,
    });
    expect(
      db.availedService.findMany.mock.calls[0][0].where.service.business_id,
    ).toBe(context.businessId);
    expect(
      db.booking.findMany.mock.calls[1][0].where.availed_services.every.service
        .business_id,
    ).toBe(context.businessId);
    expect(db.expense.findMany.mock.calls[0][0].where.business_id).toBe(
      context.businessId,
    );
    expect(
      db.payslip.findMany.mock.calls[0][0].where.employee.business_id,
    ).toBe(context.businessId);
    expect(mocks.pendingQueue).toHaveBeenCalledWith(context, { take: 20 });
    expect(mocks.claimedQueue).toHaveBeenCalledWith(context, { take: 20 });
  });

  it("does not query growth opportunities when the tenant is not entitled", async () => {
    const db = createDatabase();
    db.business.findFirst.mockResolvedValue({ name: "BeautyFeel" });
    db.booking.findMany.mockResolvedValue([]);
    db.availedService.findMany.mockResolvedValue([]);
    db.expense.findMany.mockResolvedValue([]);
    db.payslip.findMany.mockResolvedValue([]);

    const result = await getOwnerDashboardPreviewReadModel(context, {
      db: db as never,
      now: new Date("2026-09-23T04:00:00.000Z"),
    });

    expect(result?.growth).toEqual({
      enabled: false,
      opportunity: null,
      occupancy: null,
    });
    expect(mocks.opportunities).not.toHaveBeenCalled();
  });
});
