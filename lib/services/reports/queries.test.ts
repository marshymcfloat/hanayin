import { describe, expect, it, vi } from "vitest";

import { parseReportDateRange } from "./date-range";
import {
  getAttributionReportData,
  getCohortsReportData,
  getCustomersReportData,
  getOpportunityRoiReportData,
  getOverviewReportData,
} from "./queries";

describe("report queries", () => {
  it("computes overview KPIs from booking data", async () => {
    const range = parseReportDateRange({
      preset: "custom",
      start: "2026-02-01",
      end: "2026-02-28",
      groupBy: "day",
      now: new Date("2026-02-28T10:00:00+08:00"),
    });

    const db = {
      booking: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 1,
            customer_id: "c1",
            status: "COMPLETED",
            grand_total: 1000,
            amount_paid: 700,
            total_discount: 100,
            created_at: new Date("2026-02-02T09:00:00+08:00"),
            customer: { name: "Ana" },
          },
          {
            id: 2,
            customer_id: "c2",
            status: "ACCEPTED",
            grand_total: 500,
            amount_paid: 300,
            total_discount: 0,
            created_at: new Date("2026-02-03T09:00:00+08:00"),
            customer: { name: "Ben" },
          },
          {
            id: 3,
            customer_id: "c3",
            status: "CANCELLED",
            grand_total: 200,
            amount_paid: 0,
            total_discount: 0,
            created_at: new Date("2026-02-04T09:00:00+08:00"),
            customer: { name: "Cam" },
          },
        ]),
      },
      availedService: {
        findMany: vi.fn().mockResolvedValue([
          {
            service_id: 10,
            final_price: 700,
            estimated_cost: 300,
            service: {
              name: "Facial",
              category: "Skin",
            },
          },
          {
            service_id: 10,
            final_price: 300,
            estimated_cost: 100,
            service: {
              name: "Facial",
              category: "Skin",
            },
          },
        ]),
      },
      expense: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      payslip: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as NonNullable<Parameters<typeof getOverviewReportData>[0]["db"]>;

    const payload = await getOverviewReportData({
      businessId: "biz_1",
      range,
      db,
    });

    expect(payload.kpis.bookedRevenue).toBe(1500);
    expect(payload.kpis.collectedRevenue).toBe(1000);
    expect(payload.kpis.outstandingBalance).toBe(500);
    expect(payload.kpis.totalBookings).toBe(3);
    expect(payload.kpis.completionRate).toBe(50);
    expect(payload.kpis.grossRevenue).toBe(1000);
    expect(payload.kpis.estimatedCost).toBe(400);
    expect(payload.kpis.estimatedNetRevenue).toBe(600);
    expect(payload.kpis.estimatedNetMargin).toBe(60);
    expect(payload.topServices[0]).toMatchObject({
      serviceName: "Facial",
      revenue: 1000,
      timesBooked: 2,
    });
  });

  it("computes cohort retention metrics from first-booking cohorts", async () => {
    const range = parseReportDateRange({
      preset: "custom",
      start: "2026-01-01",
      end: "2026-01-31",
      groupBy: "day",
      now: new Date("2026-01-31T10:00:00+08:00"),
    });

    const db = {
      booking: {
        findMany: vi.fn().mockResolvedValue([
          {
            customer_id: "c1",
            created_at: new Date("2026-01-02T09:00:00+08:00"),
            grand_total: 200,
          },
          {
            customer_id: "c1",
            created_at: new Date("2026-01-20T09:00:00+08:00"),
            grand_total: 250,
          },
          {
            customer_id: "c2",
            created_at: new Date("2026-01-05T09:00:00+08:00"),
            grand_total: 150,
          },
          {
            customer_id: "c3",
            created_at: new Date("2025-12-20T09:00:00+08:00"),
            grand_total: 300,
          },
          {
            customer_id: "c3",
            created_at: new Date("2026-01-10T09:00:00+08:00"),
            grand_total: 200,
          },
        ]),
      },
    } as unknown as NonNullable<Parameters<typeof getCohortsReportData>[0]["db"]>;

    const payload = await getCohortsReportData({
      businessId: "biz_1",
      range,
      db,
    });

    expect(payload.kpis.cohortCustomers).toBe(2);
    expect(payload.kpis.retainedCustomers30d).toBe(1);
    expect(payload.kpis.retainedCustomers60d).toBe(1);
    expect(payload.kpis.retention30dRate).toBe(50);
    expect(payload.kpis.cohortRevenue).toBe(600);
    expect(payload.cohorts[0]).toMatchObject({
      cohortLabel: "Jan 2026",
      customers: 2,
      retained30d: 1,
    });
  });

  it("computes campaign attribution metrics with weighted scoring", async () => {
    const range = parseReportDateRange({
      preset: "custom",
      start: "2026-01-01",
      end: "2026-01-31",
      groupBy: "day",
      now: new Date("2026-01-31T10:00:00+08:00"),
    });

    const db = {
      campaign: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "camp_1",
            created_at: new Date("2026-01-05T09:00:00+08:00"),
            status: "PUBLISHED",
            offer_type: "PAYDAY_PROMO",
            opportunity: {
              type: "PAYDAY_SPIKE",
            },
            events: [
              {
                event_type: "POST_PUBLISHED",
                value: null,
                occurred_at: new Date("2026-01-05T09:30:00+08:00"),
              },
              {
                event_type: "CLICK_RECORDED",
                value: 10,
                occurred_at: new Date("2026-01-05T10:00:00+08:00"),
              },
              {
                event_type: "BOOKING_ATTRIBUTED",
                value: 3,
                occurred_at: new Date("2026-01-06T11:00:00+08:00"),
              },
              {
                event_type: "PROMO_REDEEMED",
                value: 1,
                occurred_at: new Date("2026-01-06T11:30:00+08:00"),
              },
            ],
          },
          {
            id: "camp_2",
            created_at: new Date("2026-01-08T09:00:00+08:00"),
            status: "DRAFT",
            offer_type: "BUNDLE",
            opportunity: {
              type: "WEEKEND_PREP",
            },
            events: [
              {
                event_type: "DM_INQUIRY",
                value: 2,
                occurred_at: new Date("2026-01-08T12:00:00+08:00"),
              },
            ],
          },
        ]),
      },
    } as unknown as NonNullable<Parameters<typeof getAttributionReportData>[0]["db"]>;

    const payload = await getAttributionReportData({
      businessId: "biz_1",
      range,
      db,
    });

    expect(payload.kpis.campaigns).toBe(2);
    expect(payload.kpis.publishedCampaigns).toBe(1);
    expect(payload.kpis.clicks).toBe(10);
    expect(payload.kpis.inquiries).toBe(2);
    expect(payload.kpis.attributedBookings).toBe(3);
    expect(payload.kpis.promoRedemptions).toBe(1);
    expect(payload.kpis.attributionScore).toBe(9.5);
    expect(payload.kpis.bookingsPerPublishedCampaign).toBe(300);
    expect(payload.topSegments[0]).toMatchObject({
      segmentType: "OPPORTUNITY_TYPE",
      segment: "PAYDAY_SPIKE",
    });
  });

  it("computes opportunity ROI metrics and baseline uplift", async () => {
    const range = parseReportDateRange({
      preset: "custom",
      start: "2026-01-01",
      end: "2026-01-31",
      groupBy: "day",
      now: new Date("2026-01-31T10:00:00+08:00"),
    });

    const db = {
      opportunity: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "opp_1",
            type: "PAYDAY_SPIKE",
            status: "CONVERTED",
            total_score: 0.8,
            created_at: new Date("2026-01-03T09:00:00+08:00"),
            campaigns: [
              {
                events: [
                  {
                    event_type: "BOOKING_ATTRIBUTED",
                    value: 400,
                    occurred_at: new Date("2026-01-04T09:00:00+08:00"),
                  },
                  {
                    event_type: "PROMO_REDEEMED",
                    value: 100,
                    occurred_at: new Date("2026-01-04T10:00:00+08:00"),
                  },
                ],
              },
            ],
          },
          {
            id: "opp_2",
            type: "SLOW_HOURS",
            status: "OPEN",
            total_score: 0.6,
            created_at: new Date("2026-01-10T09:00:00+08:00"),
            campaigns: [],
          },
          {
            id: "opp_3",
            type: "PAYDAY_SPIKE",
            status: "DISMISSED",
            total_score: 0.5,
            created_at: new Date("2026-01-12T09:00:00+08:00"),
            campaigns: [
              {
                events: [
                  {
                    event_type: "BOOKING_ATTRIBUTED",
                    value: 50,
                    occurred_at: new Date("2026-01-13T09:00:00+08:00"),
                  },
                ],
              },
            ],
          },
        ]),
      },
      booking: {
        findMany: vi.fn().mockResolvedValue([
          {
            amount_paid: 1200,
          },
          {
            amount_paid: 800,
          },
        ]),
      },
    } as unknown as NonNullable<Parameters<typeof getOpportunityRoiReportData>[0]["db"]>;

    const payload = await getOpportunityRoiReportData({
      businessId: "biz_1",
      range,
      db,
    });

    expect(payload.kpis.opportunities).toBe(3);
    expect(payload.kpis.convertedOpportunities).toBe(2);
    expect(payload.kpis.conversionRate).toBe(66.67);
    expect(payload.kpis.averageOpportunityScore).toBe(63.33);
    expect(payload.kpis.attributedValue).toBe(550);
    expect(payload.kpis.baselineCollectedRevenue).toBe(2000);
    expect(payload.kpis.upliftVsBaselineRate).toBe(27.5);
    expect(payload.topOpportunities[0]).toMatchObject({
      opportunityType: "PAYDAY_SPIKE",
      opportunities: 2,
      convertedOpportunities: 2,
      attributedValue: 550,
    });
  });

  it("excludes anonymous walk-ins from rankings/active-customer math but counts them as KPIs", async () => {
    const range = parseReportDateRange({
      preset: "custom",
      start: "2026-04-01",
      end: "2026-04-30",
      groupBy: "day",
      now: new Date("2026-04-30T10:00:00+08:00"),
    });

    const db = {
      customer: {
        findMany: vi.fn().mockResolvedValue([
          { id: "c1", name: "Maria", created_at: new Date("2026-04-05") },
        ]),
      },
      booking: {
        findMany: vi
          .fn()
          // rangeBookings — mix of linked and anonymous
          .mockResolvedValueOnce([
            {
              customer_id: "c1",
              grand_total: 1000,
              created_at: new Date("2026-04-10"),
              is_anonymous_walk_in: false,
              customer: { name: "Maria" },
            },
            {
              customer_id: "c1",
              grand_total: 500,
              created_at: new Date("2026-04-15"),
              is_anonymous_walk_in: false,
              customer: { name: "Maria" },
            },
            {
              customer_id: null,
              grand_total: 800,
              created_at: new Date("2026-04-20"),
              is_anonymous_walk_in: true,
              customer: null,
            },
            {
              customer_id: null,
              grand_total: 200,
              created_at: new Date("2026-04-22"),
              is_anonymous_walk_in: true,
              customer: null,
            },
          ])
          // completedBookings — empty for this test
          .mockResolvedValueOnce([]),
      },
    } as unknown as NonNullable<Parameters<typeof getCustomersReportData>[0]["db"]>;

    const payload = await getCustomersReportData({
      businessId: "biz_1",
      range,
      db,
    });

    // Anonymous walk-ins surface as their own metric.
    expect(payload.kpis.anonymousWalkInBookings).toBe(2);
    expect(payload.kpis.anonymousWalkInRevenue).toBe(1000);
    // 2 of 4 bookings = 50% anonymous.
    expect(payload.kpis.anonymousWalkInShareOfBookings).toBe(50);
    // Active customers = unique linked customer_ids = 1 (just Maria).
    expect(payload.kpis.activeCustomers).toBe(1);
    // Top customers ranking ignores anonymous bookings.
    expect(payload.topCustomers).toHaveLength(1);
    expect(payload.topCustomers[0]).toMatchObject({
      customerId: "c1",
      customerName: "Maria",
      bookings: 2,
      spend: 1500,
    });
  });
});
