import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantActorContext } from "@/lib/auth/staff-access";

const mocks = vi.hoisted(() => ({
  pendingQueue: vi.fn(),
  claimedQueue: vi.fn(),
  entitlements: vi.fn(),
  opportunities: vi.fn(),
  resolveContext: vi.fn(),
  defaultBusiness: vi.fn(),
  defaultBookings: vi.fn(),
  defaultServices: vi.fn(),
  defaultExpenses: vi.fn(),
  defaultPayslips: vi.fn(),
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
vi.mock("@/prisma/prisma", () => ({
  prisma: {
    business: { findFirst: mocks.defaultBusiness },
    booking: { findMany: mocks.defaultBookings },
    availedService: { findMany: mocks.defaultServices },
    expense: { findMany: mocks.defaultExpenses },
    payslip: { findMany: mocks.defaultPayslips },
  },
}));

import {
  getOwnerDashboardPreviewReadModel,
  resolveOwnerDashboardPreviewReadModel,
} from "./owner-dashboard-preview";

const context = {
  success: true,
  actorType: "OWNER",
  ownerId: 41,
  businessId: "tenant-current",
  businessSlug: "current-salon",
  userId: "owner-current",
} as Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;

const now = new Date("2026-09-23T04:00:00.000Z");

function createDatabase() {
  return {
    business: { findFirst: vi.fn() },
    booking: { findMany: vi.fn() },
    availedService: { findMany: vi.fn() },
    expense: { findMany: vi.fn() },
    payslip: { findMany: vi.fn() },
  };
}

function approveEmptyDashboard(
  db: ReturnType<typeof createDatabase>,
  businessName = "Current Salon",
) {
  db.business.findFirst.mockResolvedValue({ name: businessName });
  db.booking.findMany.mockResolvedValue([]);
  db.availedService.findMany.mockResolvedValue([]);
  db.expense.findMany.mockResolvedValue([]);
  db.payslip.findMany.mockResolvedValue([]);
}

function expectNoProtectedReads(db: ReturnType<typeof createDatabase>) {
  expect(db.booking.findMany).not.toHaveBeenCalled();
  expect(db.availedService.findMany).not.toHaveBeenCalled();
  expect(db.expense.findMany).not.toHaveBeenCalled();
  expect(db.payslip.findMany).not.toHaveBeenCalled();
  expect(mocks.pendingQueue).not.toHaveBeenCalled();
  expect(mocks.claimedQueue).not.toHaveBeenCalled();
  expect(mocks.entitlements).not.toHaveBeenCalled();
  expect(mocks.opportunities).not.toHaveBeenCalled();
}

describe("owner dashboard preview contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.pendingQueue.mockResolvedValue([]);
    mocks.claimedQueue.mockResolvedValue([]);
    mocks.entitlements.mockResolvedValue({ growth: false });
    mocks.opportunities.mockResolvedValue([]);
  });

  it("awaits current database membership before starting any protected read", async () => {
    const db = createDatabase();
    let resolveMembership!: (value: null) => void;
    db.business.findFirst.mockReturnValue(
      new Promise<null>((resolve) => {
        resolveMembership = resolve;
      }),
    );

    const resultPromise = getOwnerDashboardPreviewReadModel(context, {
      db: db as never,
      now,
    });

    expect(db.business.findFirst).toHaveBeenCalledOnce();
    expectNoProtectedReads(db);

    resolveMembership(null);
    await expect(resultPromise).resolves.toBeNull();
    expectNoProtectedReads(db);
  });

  it("stops before the default database and downstream providers when actor resolution is denied", async () => {
    mocks.resolveContext.mockResolvedValue({
      success: false,
      error: "Unauthorized",
    });

    await expect(
      resolveOwnerDashboardPreviewReadModel(
        context.businessSlug,
        context.userId,
      ),
    ).resolves.toBeNull();

    expect(mocks.resolveContext).toHaveBeenCalledWith(
      context.businessSlug,
      context.userId,
    );
    expect(mocks.defaultBusiness).not.toHaveBeenCalled();
    expect(mocks.defaultBookings).not.toHaveBeenCalled();
    expect(mocks.defaultServices).not.toHaveBeenCalled();
    expect(mocks.defaultExpenses).not.toHaveBeenCalled();
    expect(mocks.defaultPayslips).not.toHaveBeenCalled();
    expect(mocks.pendingQueue).not.toHaveBeenCalled();
    expect(mocks.claimedQueue).not.toHaveBeenCalled();
    expect(mocks.entitlements).not.toHaveBeenCalled();
    expect(mocks.opportunities).not.toHaveBeenCalled();
  });

  it("returns deterministic serializable zero and unavailable states for an empty tenant", async () => {
    const db = createDatabase();
    approveEmptyDashboard(db);

    const result = await getOwnerDashboardPreviewReadModel(context, {
      db: db as never,
      now,
    });

    expect(result).not.toBeNull();
    expect(result?.generatedAt).toBe("2026-09-23T04:00:00.000Z");
    expect(result?.kpis.map(({ id, value, change }) => ({ id, value, change })))
      .toEqual([
        { id: "revenue", value: 0, change: "Current month to date" },
        { id: "expenses", value: 0, change: "Current month to date" },
        { id: "income", value: 0, change: "Current month to date" },
        { id: "completion", value: 0, change: "0 of 0 bookings" },
        { id: "average", value: 0, change: "Current month to date" },
      ]);
    expect(result?.financials["7d"]).toHaveLength(7);
    expect(result?.financials.month).toHaveLength(23);
    expect(result?.financials["6m"]).toHaveLength(6);
    expect(result?.financials["1y"]).toHaveLength(12);
    expect(
      Object.values(result!.financials)
        .flat()
        .every(
          (point) =>
            point.revenue === 0 &&
            point.expenses === 0 &&
            point.cashflow === 0,
        ),
    ).toBe(true);
    expect(result).toMatchObject({
      bookings: [],
      expenseBreakdown: [],
      topServices: [],
      topCustomers: [],
      staff: [],
      queue: [],
      growth: { enabled: false, opportunity: null, occupancy: null },
      availability: {
        staffUtilization: "unavailable",
        growthOccupancy: "unavailable",
      },
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("scopes every database and provider read to the verified tenant", async () => {
    const db = createDatabase();
    approveEmptyDashboard(db);

    await getOwnerDashboardPreviewReadModel(context, {
      db: db as never,
      now,
    });

    const membership = {
      id: context.ownerId,
      business_id: context.businessId,
      user_id: context.userId,
      user: { role: "OWNER" },
    };
    expect(db.business.findFirst).toHaveBeenCalledWith({
      where: {
        id: context.businessId,
        slug: context.businessSlug,
        owners: { some: membership },
      },
      select: { name: true },
    });

    const [historyQuery, todayQuery] = db.booking.findMany.mock.calls.map(
      ([query]) => query,
    );
    expect(historyQuery.where).toMatchObject({
      business_id: context.businessId,
      business: { owners: { some: membership } },
    });
    expect(todayQuery.where).toMatchObject({
      business_id: context.businessId,
      business: { owners: { some: membership } },
      OR: [
        { customer_id: null },
        { customer: { business_id: context.businessId } },
      ],
    });
    expect(todayQuery.orderBy).toEqual({ scheduled_at: "asc" });

    const completedQuery = db.availedService.findMany.mock.calls[0][0];
    expect(completedQuery.where).toMatchObject({
      booking: {
        business_id: context.businessId,
        business: { owners: { some: membership } },
        OR: [
          { customer_id: null },
          { customer: { business_id: context.businessId } },
        ],
      },
      service: { business_id: context.businessId },
      OR: [
        { package_id: null },
        { package: { business_id: context.businessId } },
      ],
    });
    expect(completedQuery.orderBy).toEqual({ completed_at: "asc" });
    expect(db.expense.findMany.mock.calls[0][0].where).toMatchObject({
      business_id: context.businessId,
      business: { owners: { some: membership } },
    });
    expect(db.payslip.findMany.mock.calls[0][0].where).toMatchObject({
      employee: {
        business_id: context.businessId,
        business: { owners: { some: membership } },
      },
    });
    expect(mocks.pendingQueue).toHaveBeenCalledWith(context, { take: 20 });
    expect(mocks.claimedQueue).toHaveBeenCalledWith(context, { take: 20 });
    expect(mocks.entitlements).toHaveBeenCalledWith(context.businessSlug);
    expect(mocks.opportunities).not.toHaveBeenCalled();
  });

  it("orders aggregates deterministically, excludes foreign providers, and preserves ISO growth dates", async () => {
    const db = createDatabase();
    approveEmptyDashboard(db, "Ordered Salon");
    db.booking.findMany
      .mockResolvedValueOnce([
        {
          id: 1,
          status: "COMPLETED",
          grand_total: 1000,
          created_at: new Date("2026-09-03T02:00:00.000Z"),
        },
        {
          id: 2,
          status: "COMPLETED",
          grand_total: 700,
          created_at: new Date("2026-09-04T02:00:00.000Z"),
        },
        {
          id: 3,
          status: "COMPLETED",
          grand_total: 700,
          created_at: new Date("2026-09-05T02:00:00.000Z"),
        },
        {
          id: 4,
          status: "ACCEPTED",
          grand_total: 500,
          created_at: new Date("2026-09-06T02:00:00.000Z"),
        },
        {
          id: 5,
          status: "CANCELLED",
          grand_total: 9000,
          created_at: new Date("2026-09-07T02:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 50,
          status: "ACCEPTED",
          scheduled_at: new Date("2026-09-23T06:00:00.000Z"),
          estimated_end: new Date("2026-09-23T07:00:00.000Z"),
          grand_total: 500,
          amount_paid: 0,
          downpayment: null,
          customer_label: "Walk-in Sentinel",
          customer: null,
          availed_services: [
            {
              status: "PENDING",
              scheduled_at: new Date("2026-09-23T06:00:00.000Z"),
              service: { name: "Local Service", duration: 60 },
              served_by: {
                business_id: "foreign-tenant",
                user: { name: "Foreign Employee Sentinel" },
              },
              served_by_owner: {
                business_id: "foreign-tenant",
                user: { name: "Foreign Owner Sentinel" },
              },
            },
          ],
        },
      ]);
    db.availedService.findMany.mockResolvedValue([
      {
        id: 10,
        final_price: 200,
        completed_at: new Date("2026-09-03T03:00:00.000Z"),
        service_id: 1,
        service: { name: "Hair" },
        served_by: {
          id: 91,
          business_id: context.businessId,
          profile: "STAFF",
          user: { name: "Local Employee" },
        },
        served_by_owner: null,
        booking: {
          id: 1,
          grand_total: 1000,
          customer_id: "customer-a",
          customer: { name: "Customer A" },
        },
      },
      {
        id: 11,
        final_price: 700,
        completed_at: new Date("2026-09-04T03:00:00.000Z"),
        service_id: 2,
        service: { name: "Nails" },
        served_by: {
          id: 92,
          business_id: context.businessId,
          profile: "MANAGER",
          user: { name: "Local Manager" },
        },
        served_by_owner: null,
        booking: {
          id: 2,
          grand_total: 700,
          customer_id: "customer-b",
          customer: { name: "Customer B" },
        },
      },
      {
        id: 12,
        final_price: 800,
        completed_at: new Date("2026-09-05T03:00:00.000Z"),
        service_id: 1,
        service: { name: "Hair" },
        served_by: {
          id: 91,
          business_id: context.businessId,
          profile: "STAFF",
          user: { name: "Local Employee" },
        },
        served_by_owner: null,
        booking: {
          id: 1,
          grand_total: 1000,
          customer_id: "customer-a",
          customer: { name: "Customer A" },
        },
      },
      {
        id: 13,
        final_price: 700,
        completed_at: new Date("2026-09-06T03:00:00.000Z"),
        service_id: 3,
        service: { name: "Facial" },
        served_by: {
          id: 93,
          business_id: "foreign-tenant",
          profile: "STAFF",
          user: { name: "Foreign Employee Sentinel" },
        },
        served_by_owner: null,
        booking: {
          id: 3,
          grand_total: 700,
          customer_id: "customer-c",
          customer: { name: "Customer C" },
        },
      },
    ]);
    db.expense.findMany.mockResolvedValue([
      {
        amount: 100,
        category: "RENT",
        date: new Date("2026-09-05T04:00:00.000Z"),
      },
      {
        amount: 300,
        category: "SUPPLIES",
        date: new Date("2026-09-06T04:00:00.000Z"),
      },
    ]);
    db.payslip.findMany.mockResolvedValue([
      {
        total_salary: 200,
        ending_date: new Date("2026-09-15T04:00:00.000Z"),
      },
    ]);
    mocks.entitlements.mockResolvedValue({ growth: true });
    mocks.opportunities.mockResolvedValue([
      {
        id: "growth-1",
        reason: "Open afternoon capacity",
        confidence: 0.82,
        timeWindowStart: "2026-09-23T06:00:00.000Z",
        timeWindowEnd: "2026-09-23T09:00:00.000Z",
        recommendedOfferTypes: ["LIMITED_SLOTS"],
      },
    ]);

    const result = await getOwnerDashboardPreviewReadModel(context, {
      db: db as never,
      now,
    });

    expect(result?.kpis.map(({ id, value }) => ({ id, value }))).toEqual([
      { id: "revenue", value: 2400 },
      { id: "expenses", value: 600 },
      { id: "income", value: 1800 },
      { id: "completion", value: 75 },
      { id: "average", value: 800 },
    ]);
    expect(result?.topServices.map(({ name, value }) => ({ name, value })))
      .toEqual([
        { name: "Hair", value: 1000 },
        { name: "Nails", value: 700 },
        { name: "Facial", value: 700 },
      ]);
    expect(result?.topCustomers.map(({ name, value }) => ({ name, value })))
      .toEqual([
        { name: "Customer A", value: 1000 },
        { name: "Customer B", value: 700 },
        { name: "Customer C", value: 700 },
      ]);
    expect(result?.expenseBreakdown.map(({ name, value }) => ({ name, value })))
      .toEqual([
        { name: "Supplies", value: 300 },
        { name: "Team payroll", value: 200 },
        { name: "Rent", value: 100 },
      ]);
    expect(result?.staff).toEqual([
      {
        id: "employee:91",
        name: "Local Employee",
        role: "Staff",
        bookings: 1,
        revenue: 1000,
        utilization: null,
      },
      {
        id: "employee:92",
        name: "Local Manager",
        role: "Manager",
        bookings: 1,
        revenue: 700,
        utilization: null,
      },
    ]);
    expect(result?.bookings[0]).toMatchObject({
      customer: "Walk-in Sentinel",
      staff: "Unassigned",
    });
    expect(JSON.stringify(result)).not.toContain("Foreign Employee Sentinel");
    expect(JSON.stringify(result)).not.toContain("Foreign Owner Sentinel");
    expect(result?.growth).toEqual({
      enabled: true,
      opportunity: {
        id: "growth-1",
        reason: "Open afternoon capacity",
        confidence: 0.82,
        timeWindowStart: "2026-09-23T06:00:00.000Z",
        timeWindowEnd: "2026-09-23T09:00:00.000Z",
        recommendedOfferTypes: ["LIMITED_SLOTS"],
      },
      occupancy: null,
    });
    expect(mocks.opportunities).toHaveBeenCalledWith(context.businessId);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
