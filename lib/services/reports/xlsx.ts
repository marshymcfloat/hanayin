import { utils, write } from "xlsx";

import type {
  AdvancedReportPayloadMap,
  AdvancedReportTab,
  AttributionReportPayload,
  CohortsReportPayload,
  CoreReportTab,
  CustomersReportPayload,
  OperationsReportPayload,
  OpportunityRoiReportPayload,
  OverviewReportPayload,
  ReportTab,
  ReportPayloadMap,
  RevenueReportPayload,
} from "@/lib/types/reports";

type SheetRow = Record<string, string | number>;
type KpiDef = {
  metric_key: string;
  metric_label: string;
  metric_value: number;
  unit: "count" | "currency" | "percent" | "hours";
};

function createSheet(rows: SheetRow[], headers: string[]) {
  if (rows.length === 0) {
    return utils.aoa_to_sheet([headers]);
  }
  return utils.json_to_sheet(rows, { header: headers });
}

function toIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return "";
}

function buildKpiRows({
  tab,
  start,
  end,
  groupBy,
  items,
}: {
  tab: ReportTab;
  start: string;
  end: string;
  groupBy: string;
  items: KpiDef[];
}) {
  return items.map((item) => ({
    report_tab: tab,
    metric_key: item.metric_key,
    metric_label: item.metric_label,
    metric_value: item.metric_value,
    unit: item.unit,
    start_date: start,
    end_date: end,
    group_by: groupBy,
  }));
}

function buildOverviewWorkbook(payload: OverviewReportPayload) {
  const workbook = utils.book_new();
  const { start, end, groupBy } = payload.range;

  const kpiRows = buildKpiRows({
    tab: "overview",
    start,
    end,
    groupBy,
    items: [
      {
        metric_key: "booked_revenue",
        metric_label: "Booked Revenue",
        metric_value: payload.kpis.bookedRevenue,
        unit: "currency",
      },
      {
        metric_key: "collected_revenue",
        metric_label: "Collected Revenue",
        metric_value: payload.kpis.collectedRevenue,
        unit: "currency",
      },
      {
        metric_key: "outstanding_balance",
        metric_label: "Outstanding Balance",
        metric_value: payload.kpis.outstandingBalance,
        unit: "currency",
      },
      {
        metric_key: "average_ticket",
        metric_label: "Average Ticket",
        metric_value: payload.kpis.averageTicket,
        unit: "currency",
      },
      {
        metric_key: "discount_rate",
        metric_label: "Discount Rate",
        metric_value: payload.kpis.discountRate,
        unit: "percent",
      },
      {
        metric_key: "gross_revenue",
        metric_label: "Gross Revenue",
        metric_value: payload.kpis.grossRevenue,
        unit: "currency",
      },
      {
        metric_key: "estimated_cost",
        metric_label: "Estimated Cost",
        metric_value: payload.kpis.estimatedCost,
        unit: "currency",
      },
      {
        metric_key: "estimated_net_revenue",
        metric_label: "Estimated Net Revenue",
        metric_value: payload.kpis.estimatedNetRevenue,
        unit: "currency",
      },
      {
        metric_key: "estimated_net_margin",
        metric_label: "Estimated Net Margin",
        metric_value: payload.kpis.estimatedNetMargin,
        unit: "percent",
      },
      {
        metric_key: "completion_rate",
        metric_label: "Completion Rate",
        metric_value: payload.kpis.completionRate,
        unit: "percent",
      },
      {
        metric_key: "total_bookings",
        metric_label: "Total Bookings",
        metric_value: payload.kpis.totalBookings,
        unit: "count",
      },
    ],
  });

  const bookingVolumeRows = [
    {
      booking_status: "hold",
      bookings: payload.bookingVolume.hold,
      start_date: start,
      end_date: end,
    },
    {
      booking_status: "accepted",
      bookings: payload.bookingVolume.accepted,
      start_date: start,
      end_date: end,
    },
    {
      booking_status: "completed",
      bookings: payload.bookingVolume.completed,
      start_date: start,
      end_date: end,
    },
    {
      booking_status: "cancelled",
      bookings: payload.bookingVolume.cancelled,
      start_date: start,
      end_date: end,
    },
  ];

  const trendRows = payload.trend.map((item) => ({
    date: toIsoDate(item.bucketKey),
    bucket_key: item.bucketKey,
    bucket_label: item.label,
    bookings: item.bookings,
    booked_revenue: item.bookedRevenue,
    collected_revenue: item.collectedRevenue,
    start_date: start,
    end_date: end,
  }));

  const topServicesRows = [...payload.topServices]
    .sort((a, b) => b.revenue - a.revenue)
    .map((item, index) => ({
      rank: index + 1,
      service_name: item.serviceName,
      category: item.category,
      times_booked: item.timesBooked,
      revenue: item.revenue,
      start_date: start,
      end_date: end,
    }));

  const topCustomersRows = [...payload.topCustomers]
    .sort((a, b) => b.spend - a.spend)
    .map((item, index) => ({
      rank: index + 1,
      customer_name: item.customerName,
      total_bookings: item.bookings,
      total_spend: item.spend,
      start_date: start,
      end_date: end,
    }));

  utils.book_append_sheet(
    workbook,
    createSheet(kpiRows, [
      "report_tab",
      "metric_key",
      "metric_label",
      "metric_value",
      "unit",
      "start_date",
      "end_date",
      "group_by",
    ]),
    "kpi_summary",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(bookingVolumeRows, ["booking_status", "bookings", "start_date", "end_date"]),
    "booking_volume",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(trendRows, [
      "date",
      "bucket_key",
      "bucket_label",
      "bookings",
      "booked_revenue",
      "collected_revenue",
      "start_date",
      "end_date",
    ]),
    "trend",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(topServicesRows, [
      "rank",
      "service_name",
      "category",
      "times_booked",
      "revenue",
      "start_date",
      "end_date",
    ]),
    "top_services",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(topCustomersRows, [
      "rank",
      "customer_name",
      "total_bookings",
      "total_spend",
      "start_date",
      "end_date",
    ]),
    "top_customers",
  );

  return workbook;
}

function buildRevenueWorkbook(payload: RevenueReportPayload) {
  const workbook = utils.book_new();
  const { start, end, groupBy } = payload.range;

  const kpiRows = buildKpiRows({
    tab: "revenue",
    start,
    end,
    groupBy,
    items: [
      {
        metric_key: "booked_revenue",
        metric_label: "Booked Revenue",
        metric_value: payload.kpis.bookedRevenue,
        unit: "currency",
      },
      {
        metric_key: "collected_revenue",
        metric_label: "Collected Revenue",
        metric_value: payload.kpis.collectedRevenue,
        unit: "currency",
      },
      {
        metric_key: "outstanding_balance",
        metric_label: "Outstanding Balance",
        metric_value: payload.kpis.outstandingBalance,
        unit: "currency",
      },
      {
        metric_key: "average_ticket",
        metric_label: "Average Ticket",
        metric_value: payload.kpis.averageTicket,
        unit: "currency",
      },
      {
        metric_key: "discount_rate",
        metric_label: "Discount Rate",
        metric_value: payload.kpis.discountRate,
        unit: "percent",
      },
      {
        metric_key: "gross_revenue",
        metric_label: "Gross Revenue",
        metric_value: payload.kpis.grossRevenue,
        unit: "currency",
      },
      {
        metric_key: "estimated_cost",
        metric_label: "Estimated Cost",
        metric_value: payload.kpis.estimatedCost,
        unit: "currency",
      },
      {
        metric_key: "estimated_net_revenue",
        metric_label: "Estimated Net Revenue",
        metric_value: payload.kpis.estimatedNetRevenue,
        unit: "currency",
      },
      {
        metric_key: "estimated_net_margin",
        metric_label: "Estimated Net Margin",
        metric_value: payload.kpis.estimatedNetMargin,
        unit: "percent",
      },
    ],
  });

  const trendRows = payload.trend.map((item) => ({
    date: toIsoDate(item.bucketKey),
    bucket_key: item.bucketKey,
    bucket_label: item.label,
    booked_revenue: item.bookedRevenue,
    collected_revenue: item.collectedRevenue,
    discount: item.discount,
    average_ticket: item.averageTicket,
    start_date: start,
    end_date: end,
  }));

  const topCategoryRows = [...payload.topCategories]
    .sort((a, b) => b.revenue - a.revenue)
    .map((item, index) => ({
      rank: index + 1,
      category: item.category,
      total_bookings: item.bookings,
      revenue: item.revenue,
      start_date: start,
      end_date: end,
    }));

  const paymentMixRows = [...payload.paymentMix]
    .sort((a, b) => b.collectedRevenue - a.collectedRevenue)
    .map((item, index) => ({
      rank: index + 1,
      payment_method: item.method,
      total_bookings: item.bookings,
      collected_revenue: item.collectedRevenue,
      start_date: start,
      end_date: end,
    }));

  utils.book_append_sheet(
    workbook,
    createSheet(kpiRows, [
      "report_tab",
      "metric_key",
      "metric_label",
      "metric_value",
      "unit",
      "start_date",
      "end_date",
      "group_by",
    ]),
    "kpi_summary",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(trendRows, [
      "date",
      "bucket_key",
      "bucket_label",
      "booked_revenue",
      "collected_revenue",
      "discount",
      "average_ticket",
      "start_date",
      "end_date",
    ]),
    "trend",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(topCategoryRows, [
      "rank",
      "category",
      "total_bookings",
      "revenue",
      "start_date",
      "end_date",
    ]),
    "top_categories",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(paymentMixRows, [
      "rank",
      "payment_method",
      "total_bookings",
      "collected_revenue",
      "start_date",
      "end_date",
    ]),
    "payment_mix",
  );

  return workbook;
}

function buildCustomersWorkbook(payload: CustomersReportPayload) {
  const workbook = utils.book_new();
  const { start, end, groupBy } = payload.range;

  const kpiRows = buildKpiRows({
    tab: "customers",
    start,
    end,
    groupBy,
    items: [
      {
        metric_key: "new_customers",
        metric_label: "New Customers",
        metric_value: payload.kpis.newCustomers,
        unit: "count",
      },
      {
        metric_key: "active_customers",
        metric_label: "Active Customers",
        metric_value: payload.kpis.activeCustomers,
        unit: "count",
      },
      {
        metric_key: "repeat_customers",
        metric_label: "Repeat Customers",
        metric_value: payload.kpis.repeatCustomers,
        unit: "count",
      },
      {
        metric_key: "repeat_customer_rate",
        metric_label: "Repeat Customer Rate",
        metric_value: payload.kpis.repeatCustomerRate,
        unit: "percent",
      },
      {
        metric_key: "rebooking_within_45_days_rate",
        metric_label: "Rebooking Within 45 Days Rate",
        metric_value: payload.kpis.rebookingWithin45Rate,
        unit: "percent",
      },
      {
        metric_key: "at_risk_customers_60d",
        metric_label: "At-Risk Customers (60 Days)",
        metric_value: payload.kpis.atRiskCustomers60d,
        unit: "count",
      },
      {
        metric_key: "anonymous_walk_in_bookings",
        metric_label: "Anonymous Walk-in Bookings",
        metric_value: payload.kpis.anonymousWalkInBookings ?? 0,
        unit: "count",
      },
      {
        metric_key: "anonymous_walk_in_revenue",
        metric_label: "Anonymous Walk-in Revenue",
        metric_value: payload.kpis.anonymousWalkInRevenue ?? 0,
        unit: "currency",
      },
      {
        metric_key: "anonymous_walk_in_share_of_bookings",
        metric_label: "Anonymous Walk-in Share of Bookings",
        metric_value: payload.kpis.anonymousWalkInShareOfBookings ?? 0,
        unit: "percent",
      },
    ],
  });

  const trendRows = payload.trend.map((item) => ({
    date: toIsoDate(item.bucketKey),
    bucket_key: item.bucketKey,
    bucket_label: item.label,
    new_customers: item.newCustomers,
    active_customers: item.activeCustomers,
    repeat_customers: item.repeatCustomers,
    start_date: start,
    end_date: end,
  }));

  const topCustomersRows = [...payload.topCustomers]
    .sort((a, b) => b.spend - a.spend)
    .map((item, index) => ({
      rank: index + 1,
      customer_name: item.customerName,
      total_bookings: item.bookings,
      total_spend: item.spend,
      start_date: start,
      end_date: end,
    }));

  utils.book_append_sheet(
    workbook,
    createSheet(kpiRows, [
      "report_tab",
      "metric_key",
      "metric_label",
      "metric_value",
      "unit",
      "start_date",
      "end_date",
      "group_by",
    ]),
    "kpi_summary",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(trendRows, [
      "date",
      "bucket_key",
      "bucket_label",
      "new_customers",
      "active_customers",
      "repeat_customers",
      "start_date",
      "end_date",
    ]),
    "trend",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(topCustomersRows, [
      "rank",
      "customer_name",
      "total_bookings",
      "total_spend",
      "start_date",
      "end_date",
    ]),
    "top_customers",
  );

  return workbook;
}

function buildOperationsWorkbook(payload: OperationsReportPayload) {
  const workbook = utils.book_new();
  const { start, end, groupBy } = payload.range;

  const kpiRows = buildKpiRows({
    tab: "operations",
    start,
    end,
    groupBy,
    items: [
      {
        metric_key: "completed_services",
        metric_label: "Completed Services",
        metric_value: payload.kpis.completedServices,
        unit: "count",
      },
      {
        metric_key: "staff_contributors",
        metric_label: "Staff Contributors",
        metric_value: payload.kpis.staffContributors,
        unit: "count",
      },
      {
        metric_key: "payroll_total",
        metric_label: "Payroll Total",
        metric_value: payload.kpis.payrollTotal,
        unit: "currency",
      },
      {
        metric_key: "payroll_ratio",
        metric_label: "Payroll Ratio",
        metric_value: payload.kpis.payrollRatio,
        unit: "percent",
      },
      {
        metric_key: "pending_queue_count",
        metric_label: "Pending Queue Count",
        metric_value: payload.kpis.pendingQueueCount,
        unit: "count",
      },
      {
        metric_key: "median_pending_age_hours",
        metric_label: "Median Pending Age (Hours)",
        metric_value: payload.kpis.medianPendingAgeHours,
        unit: "hours",
      },
    ],
  });

  const trendRows = payload.trend.map((item) => ({
    date: toIsoDate(item.bucketKey),
    bucket_key: item.bucketKey,
    bucket_label: item.label,
    completed_services: item.completedServices,
    payroll: item.payroll,
    start_date: start,
    end_date: end,
  }));

  const staffRows = [...payload.staffPerformance]
    .sort((a, b) => b.revenueContribution - a.revenueContribution)
    .map((item, index) => ({
      rank: index + 1,
      provider_name: item.providerName,
      provider_type: item.providerType.toLowerCase(),
      completed_services: item.completedServices,
      revenue_contribution: item.revenueContribution,
      start_date: start,
      end_date: end,
    }));

  utils.book_append_sheet(
    workbook,
    createSheet(kpiRows, [
      "report_tab",
      "metric_key",
      "metric_label",
      "metric_value",
      "unit",
      "start_date",
      "end_date",
      "group_by",
    ]),
    "kpi_summary",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(trendRows, [
      "date",
      "bucket_key",
      "bucket_label",
      "completed_services",
      "payroll",
      "start_date",
      "end_date",
    ]),
    "trend",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(staffRows, [
      "rank",
      "provider_name",
      "provider_type",
      "completed_services",
      "revenue_contribution",
      "start_date",
      "end_date",
    ]),
    "staff_performance",
  );

  return workbook;
}

function buildCohortsWorkbook(payload: CohortsReportPayload) {
  const workbook = utils.book_new();
  const { start, end, groupBy } = payload.range;

  const kpiRows = buildKpiRows({
    tab: "cohorts",
    start,
    end,
    groupBy,
    items: [
      {
        metric_key: "cohort_customers",
        metric_label: "Cohort Customers",
        metric_value: payload.kpis.cohortCustomers,
        unit: "count",
      },
      {
        metric_key: "retained_customers_30d",
        metric_label: "Retained Customers (30d)",
        metric_value: payload.kpis.retainedCustomers30d,
        unit: "count",
      },
      {
        metric_key: "retained_customers_60d",
        metric_label: "Retained Customers (60d)",
        metric_value: payload.kpis.retainedCustomers60d,
        unit: "count",
      },
      {
        metric_key: "retention_30d_rate",
        metric_label: "Retention 30d Rate",
        metric_value: payload.kpis.retention30dRate,
        unit: "percent",
      },
      {
        metric_key: "retention_60d_rate",
        metric_label: "Retention 60d Rate",
        metric_value: payload.kpis.retention60dRate,
        unit: "percent",
      },
      {
        metric_key: "cohort_revenue",
        metric_label: "Cohort Revenue",
        metric_value: payload.kpis.cohortRevenue,
        unit: "currency",
      },
    ],
  });

  const trendRows = payload.trend.map((item) => ({
    date: toIsoDate(item.bucketKey),
    bucket_key: item.bucketKey,
    bucket_label: item.label,
    customers: item.customers,
    retention_30d_rate: item.retention30dRate,
    retention_60d_rate: item.retention60dRate,
    revenue: item.revenue,
    start_date: start,
    end_date: end,
  }));

  const cohortRows = payload.cohorts.map((item) => ({
    cohort_key: item.cohortKey,
    cohort_label: item.cohortLabel,
    customers: item.customers,
    retained_30d: item.retained30d,
    retained_60d: item.retained60d,
    retention_30d_rate: item.retention30dRate,
    retention_60d_rate: item.retention60dRate,
    revenue: item.revenue,
    start_date: start,
    end_date: end,
  }));

  utils.book_append_sheet(
    workbook,
    createSheet(kpiRows, [
      "report_tab",
      "metric_key",
      "metric_label",
      "metric_value",
      "unit",
      "start_date",
      "end_date",
      "group_by",
    ]),
    "kpi_summary",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(trendRows, [
      "date",
      "bucket_key",
      "bucket_label",
      "customers",
      "retention_30d_rate",
      "retention_60d_rate",
      "revenue",
      "start_date",
      "end_date",
    ]),
    "trend",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(cohortRows, [
      "cohort_key",
      "cohort_label",
      "customers",
      "retained_30d",
      "retained_60d",
      "retention_30d_rate",
      "retention_60d_rate",
      "revenue",
      "start_date",
      "end_date",
    ]),
    "cohort_segments",
  );

  return workbook;
}

function buildAttributionWorkbook(payload: AttributionReportPayload) {
  const workbook = utils.book_new();
  const { start, end, groupBy } = payload.range;

  const kpiRows = buildKpiRows({
    tab: "attribution",
    start,
    end,
    groupBy,
    items: [
      {
        metric_key: "campaigns",
        metric_label: "Campaigns",
        metric_value: payload.kpis.campaigns,
        unit: "count",
      },
      {
        metric_key: "published_campaigns",
        metric_label: "Published Campaigns",
        metric_value: payload.kpis.publishedCampaigns,
        unit: "count",
      },
      {
        metric_key: "clicks",
        metric_label: "Clicks",
        metric_value: payload.kpis.clicks,
        unit: "count",
      },
      {
        metric_key: "inquiries",
        metric_label: "Inquiries",
        metric_value: payload.kpis.inquiries,
        unit: "count",
      },
      {
        metric_key: "attributed_bookings",
        metric_label: "Attributed Bookings",
        metric_value: payload.kpis.attributedBookings,
        unit: "count",
      },
      {
        metric_key: "promo_redemptions",
        metric_label: "Promo Redemptions",
        metric_value: payload.kpis.promoRedemptions,
        unit: "count",
      },
      {
        metric_key: "attribution_score",
        metric_label: "Attribution Score",
        metric_value: payload.kpis.attributionScore,
        unit: "count",
      },
      {
        metric_key: "bookings_per_published_campaign",
        metric_label: "Bookings Per Published Campaign",
        metric_value: payload.kpis.bookingsPerPublishedCampaign,
        unit: "percent",
      },
    ],
  });

  const trendRows = payload.trend.map((item) => ({
    date: toIsoDate(item.bucketKey),
    bucket_key: item.bucketKey,
    bucket_label: item.label,
    campaigns: item.campaigns,
    clicks: item.clicks,
    inquiries: item.inquiries,
    attributed_bookings: item.attributedBookings,
    promo_redemptions: item.promoRedemptions,
    attribution_score: item.attributionScore,
    start_date: start,
    end_date: end,
  }));

  const segmentRows = payload.topSegments.map((item, index) => ({
    rank: index + 1,
    segment_type: item.segmentType.toLowerCase(),
    segment: item.segment,
    campaigns: item.campaigns,
    published_campaigns: item.publishedCampaigns,
    attributed_bookings: item.attributedBookings,
    promo_redemptions: item.promoRedemptions,
    attribution_score: item.attributionScore,
    start_date: start,
    end_date: end,
  }));

  utils.book_append_sheet(
    workbook,
    createSheet(kpiRows, [
      "report_tab",
      "metric_key",
      "metric_label",
      "metric_value",
      "unit",
      "start_date",
      "end_date",
      "group_by",
    ]),
    "kpi_summary",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(trendRows, [
      "date",
      "bucket_key",
      "bucket_label",
      "campaigns",
      "clicks",
      "inquiries",
      "attributed_bookings",
      "promo_redemptions",
      "attribution_score",
      "start_date",
      "end_date",
    ]),
    "trend",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(segmentRows, [
      "rank",
      "segment_type",
      "segment",
      "campaigns",
      "published_campaigns",
      "attributed_bookings",
      "promo_redemptions",
      "attribution_score",
      "start_date",
      "end_date",
    ]),
    "top_segments",
  );

  return workbook;
}

function buildOpportunityWorkbook(payload: OpportunityRoiReportPayload) {
  const workbook = utils.book_new();
  const { start, end, groupBy } = payload.range;

  const kpiRows = buildKpiRows({
    tab: "opportunity",
    start,
    end,
    groupBy,
    items: [
      {
        metric_key: "opportunities",
        metric_label: "Opportunities",
        metric_value: payload.kpis.opportunities,
        unit: "count",
      },
      {
        metric_key: "converted_opportunities",
        metric_label: "Converted Opportunities",
        metric_value: payload.kpis.convertedOpportunities,
        unit: "count",
      },
      {
        metric_key: "conversion_rate",
        metric_label: "Conversion Rate",
        metric_value: payload.kpis.conversionRate,
        unit: "percent",
      },
      {
        metric_key: "average_opportunity_score",
        metric_label: "Average Opportunity Score",
        metric_value: payload.kpis.averageOpportunityScore,
        unit: "percent",
      },
      {
        metric_key: "attributed_value",
        metric_label: "Attributed Value",
        metric_value: payload.kpis.attributedValue,
        unit: "count",
      },
      {
        metric_key: "baseline_collected_revenue",
        metric_label: "Baseline Collected Revenue",
        metric_value: payload.kpis.baselineCollectedRevenue,
        unit: "currency",
      },
      {
        metric_key: "uplift_vs_baseline_rate",
        metric_label: "Uplift vs Baseline Rate",
        metric_value: payload.kpis.upliftVsBaselineRate,
        unit: "percent",
      },
    ],
  });

  const trendRows = payload.trend.map((item) => ({
    date: toIsoDate(item.bucketKey),
    bucket_key: item.bucketKey,
    bucket_label: item.label,
    opportunities: item.opportunities,
    converted_opportunities: item.convertedOpportunities,
    average_score: item.averageScore,
    attributed_value: item.attributedValue,
    start_date: start,
    end_date: end,
  }));

  const opportunityRows = payload.topOpportunities.map((item, index) => ({
    rank: index + 1,
    opportunity_type: item.opportunityType,
    opportunities: item.opportunities,
    converted_opportunities: item.convertedOpportunities,
    conversion_rate: item.conversionRate,
    average_score: item.averageScore,
    attributed_value: item.attributedValue,
    start_date: start,
    end_date: end,
  }));

  utils.book_append_sheet(
    workbook,
    createSheet(kpiRows, [
      "report_tab",
      "metric_key",
      "metric_label",
      "metric_value",
      "unit",
      "start_date",
      "end_date",
      "group_by",
    ]),
    "kpi_summary",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(trendRows, [
      "date",
      "bucket_key",
      "bucket_label",
      "opportunities",
      "converted_opportunities",
      "average_score",
      "attributed_value",
      "start_date",
      "end_date",
    ]),
    "trend",
  );
  utils.book_append_sheet(
    workbook,
    createSheet(opportunityRows, [
      "rank",
      "opportunity_type",
      "opportunities",
      "converted_opportunities",
      "conversion_rate",
      "average_score",
      "attributed_value",
      "start_date",
      "end_date",
    ]),
    "top_opportunities",
  );

  return workbook;
}

export function serializeReportXlsx<
  TTab extends CoreReportTab | AdvancedReportTab,
>(
  tab: TTab,
  payload: TTab extends CoreReportTab
    ? ReportPayloadMap[TTab]
    : AdvancedReportPayloadMap[Extract<TTab, AdvancedReportTab>],
) {
  const workbook =
    tab === "overview"
      ? buildOverviewWorkbook(payload as OverviewReportPayload)
      : tab === "revenue"
        ? buildRevenueWorkbook(payload as RevenueReportPayload)
      : tab === "customers"
        ? buildCustomersWorkbook(payload as CustomersReportPayload)
        : tab === "operations"
          ? buildOperationsWorkbook(payload as OperationsReportPayload)
          : tab === "cohorts"
            ? buildCohortsWorkbook(payload as CohortsReportPayload)
            : tab === "attribution"
              ? buildAttributionWorkbook(payload as AttributionReportPayload)
              : buildOpportunityWorkbook(payload as OpportunityRoiReportPayload);

  return write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  }) as Buffer;
}
