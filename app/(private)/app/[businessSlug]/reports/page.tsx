import { PageHeader } from "@/components/dashboard/PageHeader";
import { ReportTrendChart } from "@/components/dashboard/reports/ReportTrendChart";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";
import {
  buildReportQueryString,
  CORE_REPORT_TABS,
  parseReportDateRange,
  parseReportTab,
} from "@/lib/services/reports/date-range";
import {
  getAdvancedReportPayload,
  getCoreReportPayload,
} from "@/lib/services/reports/queries";
import { recordReportTelemetry } from "@/lib/services/reports/telemetry";
import type {
  AdvancedReportTab,
  AttributionReportPayload,
  CohortsReportPayload,
  CoreReportTab,
  CustomersReportPayload,
  OperationsReportPayload,
  OpportunityRoiReportPayload,
  OverviewReportPayload,
  ReportDateRange,
  ReportTab,
  RevenueReportPayload,
} from "@/lib/types/reports";
import { requireTenantAccess } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";

function getSingleParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildTabHref(tab: ReportTab, range: ReportDateRange) {
  return `?${buildReportQueryString({ tab, range })}`;
}

function buildPresetHref({
  tab,
  preset,
}: {
  tab: ReportTab;
  preset: ReportDateRange["preset"];
}) {
  const params = new URLSearchParams();
  params.set("tab", tab);
  params.set("preset", preset);
  return `?${params.toString()}`;
}

function buildExportHref({
  businessSlug,
  tab,
  range,
}: {
  businessSlug: string;
  tab: ReportTab;
  range: ReportDateRange;
}) {
  const params = new URLSearchParams();
  params.set("businessSlug", businessSlug);
  params.set("tab", tab);
  params.set("format", "xlsx");
  params.set("preset", range.preset);
  params.set("groupBy", range.groupBy);
  params.set("start", range.start);
  params.set("end", range.end);
  return `/api/reports/export?${params.toString()}`;
}

function KpiCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
      {caption ? <p className="mt-1 text-xs text-zinc-500">{caption}</p> : null}
    </article>
  );
}

function TableShell({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty: boolean;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {empty ? (
        <p className="mt-3 text-sm text-zinc-500">
          No data available for the selected date range.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">{children}</div>
      )}
    </section>
  );
}

function AdvancedAccessMessage() {
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
      Advanced analytics are available on Plus and Pro plans.
    </section>
  );
}

function OverviewContent({ payload }: { payload: OverviewReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Booked Revenue" value={formatCurrency(payload.kpis.bookedRevenue)} />
        <KpiCard label="Collected Revenue" value={formatCurrency(payload.kpis.collectedRevenue)} />
        <KpiCard
          label="Outstanding Balance"
          value={formatCurrency(payload.kpis.outstandingBalance)}
        />
        <KpiCard label="Average Ticket" value={formatCurrency(payload.kpis.averageTicket)} />
        <KpiCard label="Discount Rate" value={formatPercent(payload.kpis.discountRate)} />
        <KpiCard label="Gross Revenue" value={formatCurrency(payload.kpis.grossRevenue)} />
        <KpiCard label="Estimated Cost" value={formatCurrency(payload.kpis.estimatedCost)} />
        <KpiCard
          label="Estimated Net Revenue"
          value={formatCurrency(payload.kpis.estimatedNetRevenue)}
        />
        <KpiCard
          label="Estimated Net Margin"
          value={formatPercent(payload.kpis.estimatedNetMargin)}
        />
        <KpiCard label="Completion Rate" value={formatPercent(payload.kpis.completionRate)} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Revenue Trend</h3>
        <div className="mt-3">
          <ReportTrendChart
            data={payload.trend}
            mode="currency"
            series={[
              { dataKey: "bookedRevenue", label: "Booked Revenue", color: "#2563eb" },
              { dataKey: "collectedRevenue", label: "Collected Revenue", color: "#16a34a" },
            ]}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <TableShell title="Top Services by Revenue" empty={payload.topServices.length === 0}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2">Service</th>
                <th className="py-2">Category</th>
                <th className="py-2">Bookings</th>
                <th className="py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {payload.topServices.map((row) => (
                <tr key={row.serviceId} className="border-b border-zinc-100 last:border-0">
                  <td className="py-2 font-medium text-zinc-900">{row.serviceName}</td>
                  <td className="py-2 text-zinc-600">{row.category}</td>
                  <td className="py-2 text-zinc-600">{row.timesBooked}</td>
                  <td className="py-2 text-right text-zinc-900">{formatCurrency(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>

        <TableShell title="Top Customers by Spend" empty={payload.topCustomers.length === 0}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2">Customer</th>
                <th className="py-2">Bookings</th>
                <th className="py-2 text-right">Spend</th>
              </tr>
            </thead>
            <tbody>
              {payload.topCustomers.map((row) => (
                <tr key={row.customerId} className="border-b border-zinc-100 last:border-0">
                  <td className="py-2 font-medium text-zinc-900">{row.customerName}</td>
                  <td className="py-2 text-zinc-600">{row.bookings}</td>
                  <td className="py-2 text-right text-zinc-900">{formatCurrency(row.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </div>
    </div>
  );
}

function RevenueContent({ payload }: { payload: RevenueReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Booked Revenue" value={formatCurrency(payload.kpis.bookedRevenue)} />
        <KpiCard label="Collected Revenue" value={formatCurrency(payload.kpis.collectedRevenue)} />
        <KpiCard
          label="Outstanding Balance"
          value={formatCurrency(payload.kpis.outstandingBalance)}
        />
        <KpiCard label="Average Ticket" value={formatCurrency(payload.kpis.averageTicket)} />
        <KpiCard label="Discount Rate" value={formatPercent(payload.kpis.discountRate)} />
        <KpiCard label="Gross Revenue" value={formatCurrency(payload.kpis.grossRevenue)} />
        <KpiCard label="Estimated Cost" value={formatCurrency(payload.kpis.estimatedCost)} />
        <KpiCard
          label="Estimated Net Revenue"
          value={formatCurrency(payload.kpis.estimatedNetRevenue)}
        />
        <KpiCard
          label="Estimated Net Margin"
          value={formatPercent(payload.kpis.estimatedNetMargin)}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Revenue and Discount Trend</h3>
        <div className="mt-3">
          <ReportTrendChart
            data={payload.trend}
            mode="currency"
            series={[
              { dataKey: "bookedRevenue", label: "Booked Revenue", color: "#2563eb" },
              { dataKey: "collectedRevenue", label: "Collected Revenue", color: "#16a34a" },
              { dataKey: "discount", label: "Discount", color: "#f59e0b" },
            ]}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <TableShell title="Top Categories by Revenue" empty={payload.topCategories.length === 0}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2">Category</th>
                <th className="py-2">Bookings</th>
                <th className="py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {payload.topCategories.map((row) => (
                <tr key={row.category} className="border-b border-zinc-100 last:border-0">
                  <td className="py-2 font-medium text-zinc-900">{row.category}</td>
                  <td className="py-2 text-zinc-600">{row.bookings}</td>
                  <td className="py-2 text-right text-zinc-900">{formatCurrency(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>

        <TableShell title="Payment Mix" empty={payload.paymentMix.length === 0}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2">Method</th>
                <th className="py-2">Bookings</th>
                <th className="py-2 text-right">Collected</th>
              </tr>
            </thead>
            <tbody>
              {payload.paymentMix.map((row) => (
                <tr key={row.method} className="border-b border-zinc-100 last:border-0">
                  <td className="py-2 font-medium text-zinc-900">{row.method}</td>
                  <td className="py-2 text-zinc-600">{row.bookings}</td>
                  <td className="py-2 text-right text-zinc-900">
                    {formatCurrency(row.collectedRevenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </div>
    </div>
  );
}

function CustomersContent({ payload }: { payload: CustomersReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="New Customers" value={formatNumber(payload.kpis.newCustomers)} />
        <KpiCard label="Active Customers" value={formatNumber(payload.kpis.activeCustomers)} />
        <KpiCard label="Repeat Customers" value={formatNumber(payload.kpis.repeatCustomers)} />
        <KpiCard
          label="Repeat Customer Rate"
          value={formatPercent(payload.kpis.repeatCustomerRate)}
        />
        <KpiCard
          label="Rebooking Within 45 Days"
          value={formatPercent(payload.kpis.rebookingWithin45Rate)}
        />
        <KpiCard label="At-Risk (60d)" value={formatNumber(payload.kpis.atRiskCustomers60d)} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Customer Activity Trend</h3>
        <div className="mt-3">
          <ReportTrendChart
            data={payload.trend}
            mode="number"
            series={[
              { dataKey: "newCustomers", label: "New Customers", color: "#2563eb" },
              { dataKey: "activeCustomers", label: "Active Customers", color: "#16a34a" },
              { dataKey: "repeatCustomers", label: "Repeat Customers", color: "#f59e0b" },
            ]}
          />
        </div>
      </section>

      <TableShell title="Top Customers by Spend" empty={payload.topCustomers.length === 0}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2">Customer</th>
              <th className="py-2">Bookings</th>
              <th className="py-2 text-right">Spend</th>
            </tr>
          </thead>
          <tbody>
            {payload.topCustomers.map((row) => (
              <tr key={row.customerId} className="border-b border-zinc-100 last:border-0">
                <td className="py-2 font-medium text-zinc-900">{row.customerName}</td>
                <td className="py-2 text-zinc-600">{row.bookings}</td>
                <td className="py-2 text-right text-zinc-900">{formatCurrency(row.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

function OperationsContent({ payload }: { payload: OperationsReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Completed Services" value={formatNumber(payload.kpis.completedServices)} />
        <KpiCard label="Staff Contributors" value={formatNumber(payload.kpis.staffContributors)} />
        <KpiCard label="Payroll Total" value={formatCurrency(payload.kpis.payrollTotal)} />
        <KpiCard label="Payroll Ratio" value={formatPercent(payload.kpis.payrollRatio)} />
        <KpiCard label="Pending Queue" value={formatNumber(payload.kpis.pendingQueueCount)} />
        <KpiCard
          label="Median Pending Age"
          value={`${formatNumber(payload.kpis.medianPendingAgeHours)}h`}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Operations Trend</h3>
        <div className="mt-3">
          <ReportTrendChart
            data={payload.trend}
            mode="number"
            series={[
              { dataKey: "completedServices", label: "Completed Services", color: "#2563eb" },
              { dataKey: "payroll", label: "Payroll", color: "#dc2626" },
            ]}
          />
        </div>
      </section>

      <TableShell title="Staff Performance" empty={payload.staffPerformance.length === 0}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2">Provider</th>
              <th className="py-2">Type</th>
              <th className="py-2">Completed Services</th>
              <th className="py-2 text-right">Revenue Contribution</th>
            </tr>
          </thead>
          <tbody>
            {payload.staffPerformance.map((row) => (
              <tr
                key={`${row.providerType}:${row.providerId}`}
                className="border-b border-zinc-100 last:border-0"
              >
                <td className="py-2 font-medium text-zinc-900">{row.providerName}</td>
                <td className="py-2 text-zinc-600">{row.providerType}</td>
                <td className="py-2 text-zinc-600">{row.completedServices}</td>
                <td className="py-2 text-right text-zinc-900">
                  {formatCurrency(row.revenueContribution)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

function CohortsContent({ payload }: { payload: CohortsReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Cohort Customers" value={formatNumber(payload.kpis.cohortCustomers)} />
        <KpiCard
          label="Retained Customers (30d)"
          value={formatNumber(payload.kpis.retainedCustomers30d)}
        />
        <KpiCard
          label="Retained Customers (60d)"
          value={formatNumber(payload.kpis.retainedCustomers60d)}
        />
        <KpiCard
          label="Retention Rate (30d)"
          value={formatPercent(payload.kpis.retention30dRate)}
        />
        <KpiCard
          label="Retention Rate (60d)"
          value={formatPercent(payload.kpis.retention60dRate)}
        />
        <KpiCard label="Cohort Revenue" value={formatCurrency(payload.kpis.cohortRevenue)} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Cohort Retention Trend</h3>
        <div className="mt-3">
          <ReportTrendChart
            data={payload.trend}
            mode="percent"
            series={[
              { dataKey: "retention30dRate", label: "30d Retention", color: "#2563eb" },
              { dataKey: "retention60dRate", label: "60d Retention", color: "#16a34a" },
            ]}
          />
        </div>
      </section>

      <TableShell title="Top Cohort Segments" empty={payload.cohorts.length === 0}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2">Cohort</th>
              <th className="py-2">Customers</th>
              <th className="py-2">Retained (30d)</th>
              <th className="py-2">Retained (60d)</th>
              <th className="py-2 text-right">30d Rate</th>
              <th className="py-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {payload.cohorts.map((row) => (
              <tr key={row.cohortKey} className="border-b border-zinc-100 last:border-0">
                <td className="py-2 font-medium text-zinc-900">{row.cohortLabel}</td>
                <td className="py-2 text-zinc-600">{formatNumber(row.customers)}</td>
                <td className="py-2 text-zinc-600">{formatNumber(row.retained30d)}</td>
                <td className="py-2 text-zinc-600">{formatNumber(row.retained60d)}</td>
                <td className="py-2 text-right text-zinc-900">
                  {formatPercent(row.retention30dRate)}
                </td>
                <td className="py-2 text-right text-zinc-900">{formatCurrency(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

function AttributionContent({ payload }: { payload: AttributionReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Campaigns" value={formatNumber(payload.kpis.campaigns)} />
        <KpiCard
          label="Published Campaigns"
          value={formatNumber(payload.kpis.publishedCampaigns)}
        />
        <KpiCard label="Clicks" value={formatNumber(payload.kpis.clicks)} />
        <KpiCard label="Inquiries" value={formatNumber(payload.kpis.inquiries)} />
        <KpiCard
          label="Attributed Bookings"
          value={formatNumber(payload.kpis.attributedBookings)}
        />
        <KpiCard
          label="Promo Redemptions"
          value={formatNumber(payload.kpis.promoRedemptions)}
        />
        <KpiCard
          label="Bookings Per Published"
          value={formatPercent(payload.kpis.bookingsPerPublishedCampaign)}
        />
        <KpiCard label="Attribution Score" value={formatNumber(payload.kpis.attributionScore)} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Campaign Attribution Trend</h3>
        <div className="mt-3">
          <ReportTrendChart
            data={payload.trend}
            mode="number"
            series={[
              { dataKey: "campaigns", label: "Campaigns", color: "#2563eb" },
              { dataKey: "attributedBookings", label: "Attributed Bookings", color: "#16a34a" },
              { dataKey: "promoRedemptions", label: "Promo Redemptions", color: "#f59e0b" },
            ]}
          />
        </div>
      </section>

      <TableShell title="Top Attribution Segments" empty={payload.topSegments.length === 0}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2">Type</th>
              <th className="py-2">Segment</th>
              <th className="py-2">Campaigns</th>
              <th className="py-2">Published</th>
              <th className="py-2">Bookings</th>
              <th className="py-2">Redemptions</th>
              <th className="py-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {payload.topSegments.map((row) => (
              <tr
                key={`${row.segmentType}:${row.segment}`}
                className="border-b border-zinc-100 last:border-0"
              >
                <td className="py-2 text-zinc-600">
                  {row.segmentType === "OPPORTUNITY_TYPE" ? "Opportunity Type" : "Offer Type"}
                </td>
                <td className="py-2 font-medium text-zinc-900">{formatEnumLabel(row.segment)}</td>
                <td className="py-2 text-zinc-600">{formatNumber(row.campaigns)}</td>
                <td className="py-2 text-zinc-600">{formatNumber(row.publishedCampaigns)}</td>
                <td className="py-2 text-zinc-600">{formatNumber(row.attributedBookings)}</td>
                <td className="py-2 text-zinc-600">{formatNumber(row.promoRedemptions)}</td>
                <td className="py-2 text-right text-zinc-900">
                  {formatNumber(row.attributionScore)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

function OpportunityRoiContent({ payload }: { payload: OpportunityRoiReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Opportunities" value={formatNumber(payload.kpis.opportunities)} />
        <KpiCard
          label="Converted Opportunities"
          value={formatNumber(payload.kpis.convertedOpportunities)}
        />
        <KpiCard label="Conversion Rate" value={formatPercent(payload.kpis.conversionRate)} />
        <KpiCard
          label="Avg Opportunity Score"
          value={formatPercent(payload.kpis.averageOpportunityScore)}
        />
        <KpiCard
          label="Attributed Value"
          value={formatNumber(payload.kpis.attributedValue)}
          caption={`Baseline revenue: ${formatCurrency(payload.kpis.baselineCollectedRevenue)}`}
        />
        <KpiCard
          label="Uplift vs Baseline"
          value={formatPercent(payload.kpis.upliftVsBaselineRate)}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Opportunity ROI Trend</h3>
        <div className="mt-3">
          <ReportTrendChart
            data={payload.trend}
            mode="number"
            series={[
              { dataKey: "opportunities", label: "Opportunities", color: "#2563eb" },
              {
                dataKey: "convertedOpportunities",
                label: "Converted Opportunities",
                color: "#16a34a",
              },
              { dataKey: "attributedValue", label: "Attributed Value", color: "#f59e0b" },
            ]}
          />
        </div>
      </section>

      <TableShell title="Opportunity Type ROI" empty={payload.topOpportunities.length === 0}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2">Opportunity Type</th>
              <th className="py-2">Opportunities</th>
              <th className="py-2">Converted</th>
              <th className="py-2">Conversion Rate</th>
              <th className="py-2">Avg Score</th>
              <th className="py-2 text-right">Attributed Value</th>
            </tr>
          </thead>
          <tbody>
            {payload.topOpportunities.map((row) => (
              <tr key={row.opportunityType} className="border-b border-zinc-100 last:border-0">
                <td className="py-2 font-medium text-zinc-900">
                  {formatEnumLabel(row.opportunityType)}
                </td>
                <td className="py-2 text-zinc-600">{formatNumber(row.opportunities)}</td>
                <td className="py-2 text-zinc-600">{formatNumber(row.convertedOpportunities)}</td>
                <td className="py-2 text-zinc-600">{formatPercent(row.conversionRate)}</td>
                <td className="py-2 text-zinc-600">{formatPercent(row.averageScore)}</td>
                <td className="py-2 text-right text-zinc-900">
                  {formatNumber(row.attributedValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) {
    redirect("/");
  }
  if (auth.session.user.role !== "OWNER") {
    redirect(`/app/${businessSlug}`);
  }

  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.reportsCore) {
    redirect(`/app/${businessSlug}`);
  }

  const business = await prisma.business.findUnique({
    where: {
      slug: businessSlug,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!business) {
    redirect(`/app/${businessSlug}`);
  }

  const tab = parseReportTab(getSingleParam(rawSearchParams.tab));
  const range = parseReportDateRange({
    preset: getSingleParam(rawSearchParams.preset),
    start: getSingleParam(rawSearchParams.start),
    end: getSingleParam(rawSearchParams.end),
    groupBy: getSingleParam(rawSearchParams.groupBy),
  });

  const isCoreTab = CORE_REPORT_TABS.includes(tab as CoreReportTab);
  const isAdvancedTab = !isCoreTab;

  let corePayload:
    | OverviewReportPayload
    | RevenueReportPayload
    | CustomersReportPayload
    | OperationsReportPayload
    | null = null;
  let advancedPayload:
    | CohortsReportPayload
    | AttributionReportPayload
    | OpportunityRoiReportPayload
    | null = null;

  if (isCoreTab) {
    corePayload = await getCoreReportPayload({
      tab: tab as CoreReportTab,
      businessId: business.id,
      range,
    });
  } else if (entitlements.reportsAdvanced) {
    advancedPayload = await getAdvancedReportPayload({
      tab: tab as AdvancedReportTab,
      businessId: business.id,
      range,
    });
  }

  await recordReportTelemetry({
    action: "REPORT_VIEW",
    actorId: auth.session.user.id,
    businessId: business.id,
    tab,
    preset: range.preset,
    rangeStart: range.start,
    rangeEnd: range.end,
    groupBy: range.groupBy,
    latencyMs: 0,
    success: true,
    metadata: {
      advancedTab: !isCoreTab,
      advancedAllowed: entitlements.reportsAdvanced,
    },
  });

  const exportHref =
    (isCoreTab && corePayload) || (isAdvancedTab && advancedPayload && entitlements.reportsAdvanced)
      ? buildExportHref({
          businessSlug,
          tab,
          range,
        })
      : null;

  const tabItems: Array<{
    id: ReportTab;
    label: string;
    advanced?: boolean;
  }> = [
    { id: "overview", label: "Overview" },
    { id: "revenue", label: "Revenue" },
    { id: "customers", label: "Customers" },
    { id: "operations", label: "Operations" },
    { id: "cohorts", label: "Cohorts", advanced: true },
    { id: "attribution", label: "Campaign Attribution", advanced: true },
    { id: "opportunity", label: "Opportunity ROI", advanced: true },
  ];

  return (
    <main className="min-h-screen bg-zinc-50/50 p-4 md:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="Reports"
          description={`${business.name} analytics across revenue, customers, and operations.`}
        >
          {exportHref ? (
            <Button asChild>
              <a href={exportHref}>Export XLSX</a>
            </Button>
          ) : null}
        </PageHeader>

        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            {tabItems.map((item) => {
              const isActive = tab === item.id;
              const isBlocked = item.advanced && !entitlements.reportsAdvanced;
              return (
                <Link
                  key={item.id}
                  href={buildTabHref(item.id, range)}
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition",
                    isActive
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100",
                    isBlocked && "border-blue-200 bg-blue-50 text-blue-800",
                  )}
                >
                  {item.label}
                  {isBlocked ? <span className="ml-1 text-xs">Plus/Pro</span> : null}
                </Link>
              );
            })}
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {(["today", "7d", "30d", "90d", "mtd"] as const).map((preset) => (
                <Link
                  key={preset}
                  href={buildPresetHref({ tab, preset })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide transition",
                    range.preset === preset
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100",
                  )}
                >
                  {preset}
                </Link>
              ))}
            </div>

            <form className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-6">
              <input type="hidden" name="tab" value={tab} />
              <input type="hidden" name="preset" value="custom" />
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 md:col-span-2">
                Start Date
                <input
                  name="start"
                  type="date"
                  defaultValue={range.start}
                  className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 md:col-span-2">
                End Date
                <input
                  name="end"
                  type="date"
                  defaultValue={range.end}
                  className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
                Group By
                <select
                  name="groupBy"
                  defaultValue={range.groupBy}
                  className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </label>
              <div className="flex items-end">
                <Button type="submit" variant="outline" className="w-full">
                  Apply
                </Button>
              </div>
            </form>

            <p className="text-xs text-zinc-500">Range: {range.label}</p>
          </div>
        </section>

        {tab === "overview" && corePayload ? (
          <OverviewContent payload={corePayload as OverviewReportPayload} />
        ) : null}
        {tab === "revenue" && corePayload ? (
          <RevenueContent payload={corePayload as RevenueReportPayload} />
        ) : null}
        {tab === "customers" && corePayload ? (
          <CustomersContent payload={corePayload as CustomersReportPayload} />
        ) : null}
        {tab === "operations" && corePayload ? (
          <OperationsContent payload={corePayload as OperationsReportPayload} />
        ) : null}
        {tab === "cohorts" && advancedPayload && entitlements.reportsAdvanced ? (
          <CohortsContent payload={advancedPayload as CohortsReportPayload} />
        ) : null}
        {tab === "attribution" && advancedPayload && entitlements.reportsAdvanced ? (
          <AttributionContent payload={advancedPayload as AttributionReportPayload} />
        ) : null}
        {tab === "opportunity" && advancedPayload && entitlements.reportsAdvanced ? (
          <OpportunityRoiContent payload={advancedPayload as OpportunityRoiReportPayload} />
        ) : null}
        {isAdvancedTab && !entitlements.reportsAdvanced ? (
          <AdvancedAccessMessage />
        ) : null}
      </section>
    </main>
  );
}
