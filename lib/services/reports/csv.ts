import type {
  CoreReportTab,
  CustomersReportPayload,
  OperationsReportPayload,
  OverviewReportPayload,
  ReportPayloadMap,
  RevenueReportPayload,
} from "@/lib/types/reports";

function escapeCsvValue(value: string | number) {
  const normalized = typeof value === "number" ? String(value) : value;
  if (normalized.includes(",") || normalized.includes('"') || normalized.includes("\n")) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }
  return normalized;
}

function toCsv(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","));
  }
  return lines.join("\n");
}

function buildOverviewCsv(payload: OverviewReportPayload) {
  const kpiRows = [
    { metric: "booked_revenue", value: payload.kpis.bookedRevenue },
    { metric: "collected_revenue", value: payload.kpis.collectedRevenue },
    { metric: "outstanding_balance", value: payload.kpis.outstandingBalance },
    { metric: "average_ticket", value: payload.kpis.averageTicket },
    { metric: "discount_rate_percent", value: payload.kpis.discountRate },
    { metric: "gross_revenue", value: payload.kpis.grossRevenue },
    { metric: "estimated_cost", value: payload.kpis.estimatedCost },
    { metric: "estimated_net_revenue", value: payload.kpis.estimatedNetRevenue },
    { metric: "estimated_net_margin_percent", value: payload.kpis.estimatedNetMargin },
    { metric: "completion_rate_percent", value: payload.kpis.completionRate },
    { metric: "total_bookings", value: payload.kpis.totalBookings },
    { metric: "booking_hold", value: payload.bookingVolume.hold },
    { metric: "booking_accepted", value: payload.bookingVolume.accepted },
    { metric: "booking_completed", value: payload.bookingVolume.completed },
    { metric: "booking_cancelled", value: payload.bookingVolume.cancelled },
  ];

  const trendRows = payload.trend.map((item) => ({
    section: "trend",
    bucket: item.label,
    bookings: item.bookings,
    booked_revenue: item.bookedRevenue,
    collected_revenue: item.collectedRevenue,
  }));

  const topServiceRows = payload.topServices.map((row) => ({
    section: "top_services",
    service_id: row.serviceId,
    service_name: row.serviceName,
    category: row.category,
    times_booked: row.timesBooked,
    revenue: row.revenue,
  }));

  const topCustomerRows = payload.topCustomers.map((row) => ({
    section: "top_customers",
    customer_id: row.customerId,
    customer_name: row.customerName,
    bookings: row.bookings,
    spend: row.spend,
  }));

  const normalizedKpis = kpiRows.map((row) => ({
    section: "kpi",
    bucket: "",
    bookings: "",
    booked_revenue: row.metric === "booked_revenue" ? row.value : "",
    collected_revenue: row.metric === "collected_revenue" ? row.value : "",
    metric: row.metric,
    metric_value: row.value,
  }));

  const normalizedRows = [
    ...normalizedKpis,
    ...trendRows.map((row) => ({ ...row, metric: "", metric_value: "" })),
    ...topServiceRows.map((row) => ({
      section: row.section,
      bucket: row.service_name,
      bookings: row.times_booked,
      booked_revenue: row.revenue,
      collected_revenue: "",
      metric: "category",
      metric_value: row.category,
    })),
    ...topCustomerRows.map((row) => ({
      section: row.section,
      bucket: row.customer_name,
      bookings: row.bookings,
      booked_revenue: row.spend,
      collected_revenue: "",
      metric: "customer_id",
      metric_value: row.customer_id,
    })),
  ];

  return toCsv(normalizedRows);
}

function buildRevenueCsv(payload: RevenueReportPayload) {
  const kpiRows = [
    { metric: "booked_revenue", value: payload.kpis.bookedRevenue },
    { metric: "collected_revenue", value: payload.kpis.collectedRevenue },
    { metric: "outstanding_balance", value: payload.kpis.outstandingBalance },
    { metric: "average_ticket", value: payload.kpis.averageTicket },
    { metric: "discount_rate_percent", value: payload.kpis.discountRate },
    { metric: "gross_revenue", value: payload.kpis.grossRevenue },
    { metric: "estimated_cost", value: payload.kpis.estimatedCost },
    { metric: "estimated_net_revenue", value: payload.kpis.estimatedNetRevenue },
    { metric: "estimated_net_margin_percent", value: payload.kpis.estimatedNetMargin },
  ];

  const trendRows = payload.trend.map((item) => ({
    section: "trend",
    bucket: item.label,
    booked_revenue: item.bookedRevenue,
    collected_revenue: item.collectedRevenue,
    discount: item.discount,
    average_ticket: item.averageTicket,
    metric: "",
    metric_value: "",
  }));

  const categoryRows = payload.topCategories.map((item) => ({
    section: "top_categories",
    bucket: item.category,
    booked_revenue: item.revenue,
    collected_revenue: "",
    discount: "",
    average_ticket: "",
    metric: "bookings",
    metric_value: item.bookings,
  }));

  const paymentRows = payload.paymentMix.map((item) => ({
    section: "payment_mix",
    bucket: item.method,
    booked_revenue: "",
    collected_revenue: item.collectedRevenue,
    discount: "",
    average_ticket: "",
    metric: "bookings",
    metric_value: item.bookings,
  }));

  return toCsv([
    ...kpiRows.map((row) => ({
      section: "kpi",
      bucket: row.metric,
      booked_revenue: "",
      collected_revenue: "",
      discount: "",
      average_ticket: "",
      metric: row.metric,
      metric_value: row.value,
    })),
    ...trendRows,
    ...categoryRows,
    ...paymentRows,
  ]);
}

function buildCustomersCsv(payload: CustomersReportPayload) {
  const kpiRows = [
    { metric: "new_customers", value: payload.kpis.newCustomers },
    { metric: "active_customers", value: payload.kpis.activeCustomers },
    { metric: "repeat_customers", value: payload.kpis.repeatCustomers },
    { metric: "repeat_customer_rate_percent", value: payload.kpis.repeatCustomerRate },
    { metric: "rebooking_within_45_rate_percent", value: payload.kpis.rebookingWithin45Rate },
    { metric: "at_risk_customers_60d", value: payload.kpis.atRiskCustomers60d },
  ];

  const trendRows = payload.trend.map((item) => ({
    section: "trend",
    bucket: item.label,
    new_customers: item.newCustomers,
    active_customers: item.activeCustomers,
    repeat_customers: item.repeatCustomers,
    metric: "",
    metric_value: "",
  }));

  const topCustomerRows = payload.topCustomers.map((item) => ({
    section: "top_customers",
    bucket: item.customerName,
    new_customers: "",
    active_customers: item.bookings,
    repeat_customers: "",
    metric: "spend",
    metric_value: item.spend,
  }));

  return toCsv([
    ...kpiRows.map((row) => ({
      section: "kpi",
      bucket: row.metric,
      new_customers: "",
      active_customers: "",
      repeat_customers: "",
      metric: row.metric,
      metric_value: row.value,
    })),
    ...trendRows,
    ...topCustomerRows,
  ]);
}

function buildOperationsCsv(payload: OperationsReportPayload) {
  const kpiRows = [
    { metric: "completed_services", value: payload.kpis.completedServices },
    { metric: "staff_contributors", value: payload.kpis.staffContributors },
    { metric: "payroll_total", value: payload.kpis.payrollTotal },
    { metric: "payroll_ratio_percent", value: payload.kpis.payrollRatio },
    { metric: "pending_queue_count", value: payload.kpis.pendingQueueCount },
    { metric: "median_pending_age_hours", value: payload.kpis.medianPendingAgeHours },
  ];

  const trendRows = payload.trend.map((item) => ({
    section: "trend",
    bucket: item.label,
    completed_services: item.completedServices,
    payroll: item.payroll,
    metric: "",
    metric_value: "",
  }));

  const staffRows = payload.staffPerformance.map((item) => ({
    section: "staff_performance",
    bucket: item.providerName,
    completed_services: item.completedServices,
    payroll: "",
    metric: `${item.providerType.toLowerCase()}_revenue`,
    metric_value: item.revenueContribution,
  }));

  return toCsv([
    ...kpiRows.map((row) => ({
      section: "kpi",
      bucket: row.metric,
      completed_services: "",
      payroll: "",
      metric: row.metric,
      metric_value: row.value,
    })),
    ...trendRows,
    ...staffRows,
  ]);
}

export function serializeReportCsv<TTab extends CoreReportTab>(
  tab: TTab,
  payload: ReportPayloadMap[TTab],
) {
  if (tab === "overview") return buildOverviewCsv(payload as OverviewReportPayload);
  if (tab === "revenue") return buildRevenueCsv(payload as RevenueReportPayload);
  if (tab === "customers") return buildCustomersCsv(payload as CustomersReportPayload);
  return buildOperationsCsv(payload as OperationsReportPayload);
}
