import { describe, expect, it } from "vitest";
import { read, utils } from "xlsx";

import { serializeReportXlsx } from "@/lib/services/reports/xlsx";
import type {
  AttributionReportPayload,
  CohortsReportPayload,
  CustomersReportPayload,
  OperationsReportPayload,
  OverviewReportPayload,
  OpportunityRoiReportPayload,
  RevenueReportPayload,
} from "@/lib/types/reports";

const baseRange = {
  preset: "30d" as const,
  start: "2026-01-20",
  end: "2026-02-18",
  startAt: new Date("2026-01-20T00:00:00.000Z"),
  endAt: new Date("2026-02-18T23:59:59.999Z"),
  spanDays: 30,
  label: "Last 30 days",
  groupBy: "day" as const,
  isCustom: false,
};

const overviewPayload: OverviewReportPayload = {
  range: baseRange,
  kpis: {
    bookedRevenue: 37444.12,
    collectedRevenue: 33193.12,
    outstandingBalance: 4251,
    averageTicket: 1497.76,
    discountRate: 1.77,
    grossRevenue: 37544.12,
    estimatedCost: 12198.4,
    estimatedNetRevenue: 25345.72,
    estimatedNetMargin: 67.51,
    completionRate: 95.83,
    totalBookings: 28,
  },
  bookingVolume: {
    hold: 1,
    accepted: 1,
    completed: 23,
    cancelled: 3,
  },
  trend: [
    {
      bucketKey: "2026-02-11",
      label: "Feb-11",
      bookings: 4,
      bookedRevenue: 3038,
      collectedRevenue: 3038,
    },
  ],
  topServices: [
    {
      serviceId: 101,
      serviceName: "Hydraderma Facial",
      category: "Skin",
      revenue: 8820,
      timesBooked: 6,
    },
  ],
  topCustomers: [
    {
      customerId: "cust_1",
      customerName: "Customer 1",
      bookings: 2,
      spend: 3745,
    },
  ],
};

const revenuePayload: RevenueReportPayload = {
  range: baseRange,
  kpis: {
    bookedRevenue: 50000,
    collectedRevenue: 42000,
    outstandingBalance: 8000,
    averageTicket: 1400,
    discountRate: 3.5,
    grossRevenue: 51500,
    estimatedCost: 16500,
    estimatedNetRevenue: 35000,
    estimatedNetMargin: 68,
  },
  trend: [
    {
      bucketKey: "2026-02-11",
      label: "Feb-11",
      bookedRevenue: 5000,
      collectedRevenue: 4500,
      discount: 100,
      averageTicket: 1250,
    },
  ],
  topCategories: [
    {
      category: "Skin",
      revenue: 15000,
      bookings: 10,
    },
  ],
  paymentMix: [
    {
      method: "Cash",
      bookings: 9,
      collectedRevenue: 9000,
    },
  ],
};

const customersPayload: CustomersReportPayload = {
  range: baseRange,
  kpis: {
    newCustomers: 18,
    activeCustomers: 102,
    repeatCustomers: 44,
    repeatCustomerRate: 43.14,
    rebookingWithin45Rate: 31.5,
    atRiskCustomers60d: 12,
  },
  trend: [
    {
      bucketKey: "2026-02-11",
      label: "Feb-11",
      newCustomers: 4,
      activeCustomers: 9,
      repeatCustomers: 5,
    },
  ],
  topCustomers: [
    {
      customerId: "cust_2",
      customerName: "Customer 2",
      bookings: 3,
      spend: 2800,
    },
    {
      customerId: "cust_1",
      customerName: "Customer 1",
      bookings: 5,
      spend: 3900,
    },
  ],
};

const operationsPayload: OperationsReportPayload = {
  range: baseRange,
  kpis: {
    completedServices: 88,
    staffContributors: 6,
    payrollTotal: 21000,
    payrollRatio: 42,
    pendingQueueCount: 4,
    medianPendingAgeHours: 3.2,
  },
  trend: [
    {
      bucketKey: "2026-02-11",
      label: "Feb-11",
      completedServices: 11,
      payroll: 2100,
    },
  ],
  staffPerformance: [
    {
      providerId: "emp_1",
      providerType: "EMPLOYEE",
      providerName: "Anna",
      completedServices: 14,
      revenueContribution: 8800,
    },
  ],
};

const cohortsPayload: CohortsReportPayload = {
  range: baseRange,
  kpis: {
    cohortCustomers: 30,
    retainedCustomers30d: 12,
    retainedCustomers60d: 8,
    retention30dRate: 40,
    retention60dRate: 26.67,
    cohortRevenue: 21000,
  },
  trend: [
    {
      bucketKey: "2026-01",
      label: "Jan 2026",
      customers: 30,
      retention30dRate: 40,
      retention60dRate: 26.67,
      revenue: 21000,
    },
  ],
  cohorts: [
    {
      cohortKey: "2026-01",
      cohortLabel: "Jan 2026",
      customers: 30,
      retained30d: 12,
      retained60d: 8,
      retention30dRate: 40,
      retention60dRate: 26.67,
      revenue: 21000,
    },
  ],
};

const attributionPayload: AttributionReportPayload = {
  range: baseRange,
  kpis: {
    campaigns: 10,
    publishedCampaigns: 6,
    clicks: 220,
    inquiries: 48,
    attributedBookings: 16,
    promoRedemptions: 8,
    attributionScore: 96,
    bookingsPerPublishedCampaign: 266.67,
  },
  trend: [
    {
      bucketKey: "2026-02-11",
      label: "Feb-11",
      campaigns: 2,
      clicks: 20,
      inquiries: 5,
      attributedBookings: 2,
      promoRedemptions: 1,
      attributionScore: 11,
    },
  ],
  topSegments: [
    {
      segmentType: "OPPORTUNITY_TYPE",
      segment: "SEASONAL",
      campaigns: 4,
      publishedCampaigns: 3,
      attributedBookings: 6,
      promoRedemptions: 2,
      attributionScore: 22,
    },
  ],
};

const opportunityPayload: OpportunityRoiReportPayload = {
  range: baseRange,
  kpis: {
    opportunities: 12,
    convertedOpportunities: 5,
    conversionRate: 41.67,
    averageOpportunityScore: 64.5,
    attributedValue: 14,
    baselineCollectedRevenue: 48000,
    upliftVsBaselineRate: 0.03,
  },
  trend: [
    {
      bucketKey: "2026-02-11",
      label: "Feb-11",
      opportunities: 3,
      convertedOpportunities: 1,
      averageScore: 61.4,
      attributedValue: 4,
    },
  ],
  topOpportunities: [
    {
      opportunityType: "LAPSED_30D",
      opportunities: 6,
      convertedOpportunities: 3,
      conversionRate: 50,
      averageScore: 70,
      attributedValue: 7,
    },
  ],
};

describe("serializeReportXlsx", () => {
  it("builds overview workbook with one-granularity-per-sheet", () => {
    const workbook = read(serializeReportXlsx("overview", overviewPayload), {
      type: "buffer",
    });

    expect(workbook.SheetNames).toEqual([
      "kpi_summary",
      "booking_volume",
      "trend",
      "top_services",
      "top_customers",
    ]);

    const topCustomerRows = utils.sheet_to_json<Record<string, string | number>>(
      workbook.Sheets.top_customers,
      { defval: "" },
    );
    expect(Object.keys(topCustomerRows[0] ?? {})).toEqual([
      "rank",
      "customer_name",
      "total_bookings",
      "total_spend",
      "start_date",
      "end_date",
    ]);
    expect(topCustomerRows[0]).toMatchObject({
      rank: 1,
      customer_name: "Customer 1",
      total_spend: 3745,
    });
  });

  it("builds revenue workbook with trend/category/payment sheets", () => {
    const workbook = read(serializeReportXlsx("revenue", revenuePayload), {
      type: "buffer",
    });

    expect(workbook.SheetNames).toEqual([
      "kpi_summary",
      "trend",
      "top_categories",
      "payment_mix",
    ]);

    const trendRows = utils.sheet_to_json<Record<string, string | number>>(
      workbook.Sheets.trend,
      { defval: "" },
    );
    expect(trendRows[0]).toMatchObject({
      date: "2026-02-11",
      booked_revenue: 5000,
      collected_revenue: 4500,
    });
  });

  it("builds customers workbook with KPI, daily trend, and top customers", () => {
    const workbook = read(serializeReportXlsx("customers", customersPayload), {
      type: "buffer",
    });

    expect(workbook.SheetNames).toEqual(["kpi_summary", "trend", "top_customers"]);

    const kpiRows = utils.sheet_to_json<Record<string, string | number>>(
      workbook.Sheets.kpi_summary,
      { defval: "" },
    );
    expect(kpiRows).toContainEqual(
      expect.objectContaining({
        metric_key: "repeat_customer_rate",
        metric_value: 43.14,
      }),
    );
    expect(kpiRows).toContainEqual(
      expect.objectContaining({
        metric_key: "rebooking_within_45_days_rate",
        metric_value: 31.5,
      }),
    );
  });

  it("builds operations workbook with trend and staff performance sheets", () => {
    const workbook = read(serializeReportXlsx("operations", operationsPayload), {
      type: "buffer",
    });

    expect(workbook.SheetNames).toEqual(["kpi_summary", "trend", "staff_performance"]);

    const staffRows = utils.sheet_to_json<Record<string, string | number>>(
      workbook.Sheets.staff_performance,
      { defval: "" },
    );
    expect(staffRows[0]).toMatchObject({
      provider_name: "Anna",
      provider_type: "employee",
      revenue_contribution: 8800,
    });
  });

  it("builds cohorts workbook with cohort segment sheet", () => {
    const workbook = read(serializeReportXlsx("cohorts", cohortsPayload), {
      type: "buffer",
    });

    expect(workbook.SheetNames).toEqual(["kpi_summary", "trend", "cohort_segments"]);
  });

  it("builds attribution workbook with top segments sheet", () => {
    const workbook = read(serializeReportXlsx("attribution", attributionPayload), {
      type: "buffer",
    });

    expect(workbook.SheetNames).toEqual(["kpi_summary", "trend", "top_segments"]);
  });

  it("builds opportunity workbook with top opportunities sheet", () => {
    const workbook = read(serializeReportXlsx("opportunity", opportunityPayload), {
      type: "buffer",
    });

    expect(workbook.SheetNames).toEqual(["kpi_summary", "trend", "top_opportunities"]);
  });
});
