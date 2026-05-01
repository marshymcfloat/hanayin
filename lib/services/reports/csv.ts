import type {
  CoreReportTab,
  CustomersReportPayload,
  OperationsReportPayload,
  OverviewReportPayload,
  ReportPayloadMap,
  RevenueReportPayload,
} from "@/lib/types/reports";

type FriendlyCsvRow = {
  Section: string;
  Item: string;
  Metric: string;
  Value: string | number;
  Unit: string;
  Date: string;
  "Start Date": string;
  "End Date": string;
};

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

function normalizeIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function createRow({
  section,
  item,
  metric,
  value,
  unit = "",
  date = "",
  startDate,
  endDate,
}: {
  section: string;
  item: string;
  metric: string;
  value: string | number;
  unit?: string;
  date?: string;
  startDate: string;
  endDate: string;
}): FriendlyCsvRow {
  return {
    Section: section,
    Item: item,
    Metric: metric,
    Value: value,
    Unit: unit,
    Date: date,
    "Start Date": startDate,
    "End Date": endDate,
  };
}

function buildOverviewCsv(payload: OverviewReportPayload) {
  const { start, end } = payload.range;
  const rows: FriendlyCsvRow[] = [
    createRow({
      section: "Summary",
      item: "Overview",
      metric: "Booked Revenue",
      value: payload.kpis.bookedRevenue,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Overview",
      metric: "Collected Revenue",
      value: payload.kpis.collectedRevenue,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Overview",
      metric: "Outstanding Balance",
      value: payload.kpis.outstandingBalance,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Overview",
      metric: "Average Ticket",
      value: payload.kpis.averageTicket,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Overview",
      metric: "Discount Rate",
      value: payload.kpis.discountRate,
      unit: "Percent",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Overview",
      metric: "Gross Revenue",
      value: payload.kpis.grossRevenue,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Overview",
      metric: "Estimated Cost",
      value: payload.kpis.estimatedCost,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Overview",
      metric: "Estimated Net Revenue",
      value: payload.kpis.estimatedNetRevenue,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Overview",
      metric: "Estimated Net Margin",
      value: payload.kpis.estimatedNetMargin,
      unit: "Percent",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Overview",
      metric: "Completion Rate",
      value: payload.kpis.completionRate,
      unit: "Percent",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Overview",
      metric: "Total Bookings",
      value: payload.kpis.totalBookings,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Booking Volume",
      item: "Overview",
      metric: "On Hold",
      value: payload.bookingVolume.hold,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Booking Volume",
      item: "Overview",
      metric: "Accepted",
      value: payload.bookingVolume.accepted,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Booking Volume",
      item: "Overview",
      metric: "Completed",
      value: payload.bookingVolume.completed,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Booking Volume",
      item: "Overview",
      metric: "Cancelled",
      value: payload.bookingVolume.cancelled,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    ...payload.trend.flatMap((item) => [
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "Bookings",
        value: item.bookings,
        unit: "Count",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "Booked Revenue",
        value: item.bookedRevenue,
        unit: "Currency",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "Collected Revenue",
        value: item.collectedRevenue,
        unit: "Currency",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
    ]),
    ...payload.topServices.flatMap((item) => [
      createRow({
        section: "Top Services",
        item: item.serviceName,
        metric: "Category",
        value: item.category,
        unit: "Text",
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Top Services",
        item: item.serviceName,
        metric: "Times Booked",
        value: item.timesBooked,
        unit: "Count",
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Top Services",
        item: item.serviceName,
        metric: "Revenue",
        value: item.revenue,
        unit: "Currency",
        startDate: start,
        endDate: end,
      }),
    ]),
    ...payload.topCustomers.flatMap((item) => [
      createRow({
        section: "Top Customers",
        item: item.customerName,
        metric: "Total Bookings",
        value: item.bookings,
        unit: "Count",
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Top Customers",
        item: item.customerName,
        metric: "Total Spend",
        value: item.spend,
        unit: "Currency",
        startDate: start,
        endDate: end,
      }),
    ]),
  ];

  return toCsv(rows);
}

function buildRevenueCsv(payload: RevenueReportPayload) {
  const { start, end } = payload.range;
  const rows: FriendlyCsvRow[] = [
    createRow({
      section: "Summary",
      item: "Revenue",
      metric: "Booked Revenue",
      value: payload.kpis.bookedRevenue,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Revenue",
      metric: "Collected Revenue",
      value: payload.kpis.collectedRevenue,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Revenue",
      metric: "Outstanding Balance",
      value: payload.kpis.outstandingBalance,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Revenue",
      metric: "Average Ticket",
      value: payload.kpis.averageTicket,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Revenue",
      metric: "Discount Rate",
      value: payload.kpis.discountRate,
      unit: "Percent",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Revenue",
      metric: "Gross Revenue",
      value: payload.kpis.grossRevenue,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Revenue",
      metric: "Estimated Cost",
      value: payload.kpis.estimatedCost,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Revenue",
      metric: "Estimated Net Revenue",
      value: payload.kpis.estimatedNetRevenue,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Revenue",
      metric: "Estimated Net Margin",
      value: payload.kpis.estimatedNetMargin,
      unit: "Percent",
      startDate: start,
      endDate: end,
    }),
    ...payload.trend.flatMap((item) => [
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "Booked Revenue",
        value: item.bookedRevenue,
        unit: "Currency",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "Collected Revenue",
        value: item.collectedRevenue,
        unit: "Currency",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "Discount",
        value: item.discount,
        unit: "Currency",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "Average Ticket",
        value: item.averageTicket,
        unit: "Currency",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
    ]),
    ...payload.topCategories.flatMap((item) => [
      createRow({
        section: "Top Categories",
        item: item.category,
        metric: "Revenue",
        value: item.revenue,
        unit: "Currency",
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Top Categories",
        item: item.category,
        metric: "Bookings",
        value: item.bookings,
        unit: "Count",
        startDate: start,
        endDate: end,
      }),
    ]),
    ...payload.paymentMix.flatMap((item) => [
      createRow({
        section: "Payment Mix",
        item: item.method,
        metric: "Bookings",
        value: item.bookings,
        unit: "Count",
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Payment Mix",
        item: item.method,
        metric: "Collected Revenue",
        value: item.collectedRevenue,
        unit: "Currency",
        startDate: start,
        endDate: end,
      }),
    ]),
  ];

  return toCsv(rows);
}

function buildCustomersCsv(payload: CustomersReportPayload) {
  const { start, end } = payload.range;
  const rows: FriendlyCsvRow[] = [
    createRow({
      section: "Summary",
      item: "Customers",
      metric: "New Customers",
      value: payload.kpis.newCustomers,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Customers",
      metric: "Active Customers",
      value: payload.kpis.activeCustomers,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Customers",
      metric: "Repeat Customers",
      value: payload.kpis.repeatCustomers,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Customers",
      metric: "Repeat Customer Rate",
      value: payload.kpis.repeatCustomerRate,
      unit: "Percent",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Customers",
      metric: "Rebooking Within 45 Days Rate",
      value: payload.kpis.rebookingWithin45Rate,
      unit: "Percent",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Customers",
      metric: "At-Risk Customers (60 Days)",
      value: payload.kpis.atRiskCustomers60d,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Customers",
      metric: "Anonymous Walk-in Bookings",
      value: payload.kpis.anonymousWalkInBookings ?? 0,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Customers",
      metric: "Anonymous Walk-in Revenue",
      value: payload.kpis.anonymousWalkInRevenue ?? 0,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Customers",
      metric: "Anonymous Walk-in Share of Bookings",
      value: payload.kpis.anonymousWalkInShareOfBookings ?? 0,
      unit: "Percent",
      startDate: start,
      endDate: end,
    }),
    ...payload.trend.flatMap((item) => [
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "New Customers",
        value: item.newCustomers,
        unit: "Count",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "Active Customers",
        value: item.activeCustomers,
        unit: "Count",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "Repeat Customers",
        value: item.repeatCustomers,
        unit: "Count",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
    ]),
    ...payload.topCustomers.flatMap((item) => [
      createRow({
        section: "Top Customers",
        item: item.customerName,
        metric: "Total Bookings",
        value: item.bookings,
        unit: "Count",
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Top Customers",
        item: item.customerName,
        metric: "Total Spend",
        value: item.spend,
        unit: "Currency",
        startDate: start,
        endDate: end,
      }),
    ]),
  ];

  return toCsv(rows);
}

function buildOperationsCsv(payload: OperationsReportPayload) {
  const { start, end } = payload.range;
  const rows: FriendlyCsvRow[] = [
    createRow({
      section: "Summary",
      item: "Operations",
      metric: "Completed Services",
      value: payload.kpis.completedServices,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Operations",
      metric: "Staff Contributors",
      value: payload.kpis.staffContributors,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Operations",
      metric: "Payroll Total",
      value: payload.kpis.payrollTotal,
      unit: "Currency",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Operations",
      metric: "Payroll Ratio",
      value: payload.kpis.payrollRatio,
      unit: "Percent",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Operations",
      metric: "Pending Queue Count",
      value: payload.kpis.pendingQueueCount,
      unit: "Count",
      startDate: start,
      endDate: end,
    }),
    createRow({
      section: "Summary",
      item: "Operations",
      metric: "Median Pending Age",
      value: payload.kpis.medianPendingAgeHours,
      unit: "Hours",
      startDate: start,
      endDate: end,
    }),
    ...payload.trend.flatMap((item) => [
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "Completed Services",
        value: item.completedServices,
        unit: "Count",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Daily Trend",
        item: item.label,
        metric: "Payroll",
        value: item.payroll,
        unit: "Currency",
        date: normalizeIsoDate(item.bucketKey),
        startDate: start,
        endDate: end,
      }),
    ]),
    ...payload.staffPerformance.flatMap((item) => [
      createRow({
        section: "Staff Performance",
        item: item.providerName,
        metric: "Provider Type",
        value: item.providerType === "OWNER" ? "Owner" : "Employee",
        unit: "Text",
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Staff Performance",
        item: item.providerName,
        metric: "Completed Services",
        value: item.completedServices,
        unit: "Count",
        startDate: start,
        endDate: end,
      }),
      createRow({
        section: "Staff Performance",
        item: item.providerName,
        metric: "Revenue Contribution",
        value: item.revenueContribution,
        unit: "Currency",
        startDate: start,
        endDate: end,
      }),
    ]),
  ];

  return toCsv(rows);
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
