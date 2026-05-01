import {
  ShoppingCart,
  Zap,
  Home,
  Wrench,
  Megaphone,
  Settings,
  GraduationCap,
  MoreHorizontal,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  Info,
  TrendingDown,
} from "lucide-react";
import { ReportTrendChart } from "@/components/dashboard/reports/ReportTrendChart";
import { cn, formatCurrency } from "@/lib/utils";
import { CORE_REPORT_TABS } from "@/lib/services/reports/date-range";
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
  ExpensesReportPayload,
  OperationsReportPayload,
  OpportunityRoiReportPayload,
  OverviewReportPayload,
  ReportDateRange,
  ReportTab,
  RevenueReportPayload,
  SmartInsight,
} from "@/lib/types/reports";

// ── Helpers ───────────────────────────────────────────────────

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
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

// ── KPI Cards ─────────────────────────────────────────────────

function HeroKpiCard({
  label,
  value,
  caption,
  accent,
}: {
  label: string;
  value: string;
  caption?: string;
  accent?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl p-5 relative overflow-hidden",
        accent
          ? "bg-gradient-to-br from-primary to-primary/75 shadow-lg shadow-primary/20"
          : "bg-card border border-border",
      )}
    >
      {accent && (
        <>
          <div className="absolute -right-5 -top-5 h-24 w-24 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -right-1 -bottom-8 h-20 w-20 rounded-full bg-white/5 pointer-events-none" />
        </>
      )}
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wider",
          accent ? "text-white/70" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-3xl font-bold tracking-tight leading-none",
          accent ? "text-white" : "text-foreground",
        )}
      >
        {value}
      </p>
      {caption && (
        <p className={cn("mt-1.5 text-xs", accent ? "text-white/55" : "text-muted-foreground")}>
          {caption}
        </p>
      )}
    </article>
  );
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
    <article className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold tracking-tight text-foreground">{value}</p>
      {caption ? <p className="mt-1 text-xs text-muted-foreground">{caption}</p> : null}
    </article>
  );
}

// ── Smart Insights ────────────────────────────────────────────

const INSIGHT_STYLES: Record<
  SmartInsight["severity"],
  {
    bg: string;
    border: string;
    icon: React.ElementType;
    iconColor: string;
    textColor: string;
  }
> = {
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: CheckCircle2,
    iconColor: "text-emerald-600",
    textColor: "text-emerald-800",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: AlertTriangle,
    iconColor: "text-amber-600",
    textColor: "text-amber-800",
  },
  alert: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: TrendingDown,
    iconColor: "text-red-600",
    textColor: "text-red-800",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: Info,
    iconColor: "text-blue-600",
    textColor: "text-blue-800",
  },
};

function SmartInsightsRow({ insights }: { insights: SmartInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Smart Insights
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {insights.map((insight) => {
          const style = INSIGHT_STYLES[insight.severity];
          const Icon = style.icon;
          return (
            <div
              key={insight.id}
              className={cn(
                "rounded-xl border px-4 py-3 flex items-start gap-3",
                style.bg,
                style.border,
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", style.iconColor)} />
              <div>
                <p className={cn("text-xs font-semibold", style.textColor)}>
                  {insight.title}
                </p>
                <p
                  className={cn(
                    "text-[11px] mt-0.5 leading-relaxed",
                    style.textColor,
                    "opacity-80",
                  )}
                >
                  {insight.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Table helpers ──────────────────────────────────────────────

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
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {empty ? (
        <p className="mt-3 text-sm text-muted-foreground">
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
    <section className="rounded-xl border border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4 text-sm text-blue-800 dark:text-blue-400">
      Advanced analytics are available on Plus and Pro plans.
    </section>
  );
}

function DataTable({ children }: { children: React.ReactNode }) {
  return <table className="min-w-full text-sm">{children}</table>;
}

function DataThead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
        {children}
      </tr>
    </thead>
  );
}

function DataTh({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn("py-2 pr-4 last:pr-0", right && "text-right")}>{children}</th>
  );
}

function DataTd({
  children,
  muted,
  right,
  medium,
}: {
  children: React.ReactNode;
  muted?: boolean;
  right?: boolean;
  medium?: boolean;
}) {
  return (
    <td
      className={cn(
        "py-2 pr-4 last:pr-0",
        muted ? "text-muted-foreground" : "text-foreground",
        medium && "font-medium",
        right && "text-right",
      )}
    >
      {children}
    </td>
  );
}

function DataRow({ children }: { children: React.ReactNode }) {
  return <tr className="border-b border-border/50 last:border-0">{children}</tr>;
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ── Tab Content Components ────────────────────────────────────

function OverviewContent({ payload }: { payload: OverviewReportPayload }) {
  return (
    <div className="space-y-6">
      {payload.insights.length > 0 && <SmartInsightsRow insights={payload.insights} />}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <HeroKpiCard
          label="Collected Revenue"
          value={formatCurrency(payload.kpis.collectedRevenue)}
          caption="Cash in hand"
          accent
        />
        <HeroKpiCard
          label="Booked Revenue"
          value={formatCurrency(payload.kpis.bookedRevenue)}
          caption={`${formatCurrency(payload.kpis.outstandingBalance)} outstanding`}
        />
        <HeroKpiCard
          label="Total Expenses"
          value={formatCurrency(payload.kpis.totalExpenses)}
          caption="Operating costs this period"
        />
        <HeroKpiCard
          label="True Net Profit"
          value={formatCurrency(payload.kpis.trueNetProfit)}
          caption="Revenue minus payroll & expenses"
        />
      </section>

      <section className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Average Ticket" value={formatCurrency(payload.kpis.averageTicket)} />
        <KpiCard label="Discount Rate" value={formatPercent(payload.kpis.discountRate)} />
        <KpiCard label="Gross Revenue" value={formatCurrency(payload.kpis.grossRevenue)} />
        <KpiCard label="Est. Cost" value={formatCurrency(payload.kpis.estimatedCost)} />
        <KpiCard label="Completion Rate" value={formatPercent(payload.kpis.completionRate)} />
        <KpiCard label="Total Bookings" value={formatNumber(payload.kpis.totalBookings)} />
      </section>

      <ChartSection title="Revenue Trend">
        <ReportTrendChart
          data={payload.trend}
          mode="currency"
          series={[
            { dataKey: "bookedRevenue", label: "Booked Revenue", color: "#2563eb" },
            { dataKey: "collectedRevenue", label: "Collected Revenue", color: "#16a34a" },
          ]}
        />
      </ChartSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <TableShell title="Top Services by Revenue" empty={payload.topServices.length === 0}>
          <DataTable>
            <DataThead>
              <DataTh>Service</DataTh>
              <DataTh>Category</DataTh>
              <DataTh>Bookings</DataTh>
              <DataTh right>Revenue</DataTh>
            </DataThead>
            <tbody>
              {payload.topServices.map((row) => (
                <DataRow key={row.serviceId}>
                  <DataTd medium>{row.serviceName}</DataTd>
                  <DataTd muted>{row.category}</DataTd>
                  <DataTd muted>{row.timesBooked}</DataTd>
                  <DataTd right>{formatCurrency(row.revenue)}</DataTd>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        </TableShell>

        <TableShell title="Top Customers by Spend" empty={payload.topCustomers.length === 0}>
          <DataTable>
            <DataThead>
              <DataTh>Customer</DataTh>
              <DataTh>Bookings</DataTh>
              <DataTh right>Spend</DataTh>
            </DataThead>
            <tbody>
              {payload.topCustomers.map((row) => (
                <DataRow key={row.customerId}>
                  <DataTd medium>{row.customerName}</DataTd>
                  <DataTd muted>{row.bookings}</DataTd>
                  <DataTd right>{formatCurrency(row.spend)}</DataTd>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        </TableShell>
      </div>
    </div>
  );
}

function RevenueContent({ payload }: { payload: RevenueReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <HeroKpiCard
          label="Collected Revenue"
          value={formatCurrency(payload.kpis.collectedRevenue)}
          accent
        />
        <HeroKpiCard
          label="Booked Revenue"
          value={formatCurrency(payload.kpis.bookedRevenue)}
          caption={`${formatCurrency(payload.kpis.outstandingBalance)} outstanding`}
        />
        <KpiCard label="Average Ticket" value={formatCurrency(payload.kpis.averageTicket)} />
        <KpiCard label="Discount Rate" value={formatPercent(payload.kpis.discountRate)} />
        <KpiCard label="Gross Revenue" value={formatCurrency(payload.kpis.grossRevenue)} />
        <KpiCard label="Est. Cost" value={formatCurrency(payload.kpis.estimatedCost)} />
        <KpiCard label="Net Revenue" value={formatCurrency(payload.kpis.estimatedNetRevenue)} />
        <KpiCard label="Net Margin" value={formatPercent(payload.kpis.estimatedNetMargin)} />
      </section>

      <ChartSection title="Revenue and Discount Trend">
        <ReportTrendChart
          data={payload.trend}
          mode="currency"
          series={[
            { dataKey: "bookedRevenue", label: "Booked Revenue", color: "#2563eb" },
            { dataKey: "collectedRevenue", label: "Collected Revenue", color: "#16a34a" },
            { dataKey: "discount", label: "Discount", color: "#f59e0b" },
          ]}
        />
      </ChartSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <TableShell title="Top Categories" empty={payload.topCategories.length === 0}>
          <DataTable>
            <DataThead>
              <DataTh>Category</DataTh>
              <DataTh>Bookings</DataTh>
              <DataTh right>Revenue</DataTh>
            </DataThead>
            <tbody>
              {payload.topCategories.map((row) => (
                <DataRow key={row.category}>
                  <DataTd medium>{row.category}</DataTd>
                  <DataTd muted>{row.bookings}</DataTd>
                  <DataTd right>{formatCurrency(row.revenue)}</DataTd>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        </TableShell>

        <TableShell title="Payment Mix" empty={payload.paymentMix.length === 0}>
          <DataTable>
            <DataThead>
              <DataTh>Method</DataTh>
              <DataTh>Bookings</DataTh>
              <DataTh right>Collected</DataTh>
            </DataThead>
            <tbody>
              {payload.paymentMix.map((row) => (
                <DataRow key={row.method}>
                  <DataTd medium>{row.method}</DataTd>
                  <DataTd muted>{row.bookings}</DataTd>
                  <DataTd right>{formatCurrency(row.collectedRevenue)}</DataTd>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        </TableShell>
      </div>
    </div>
  );
}

function CustomersContent({ payload }: { payload: CustomersReportPayload }) {
  const anon = payload.kpis.anonymousWalkInBookings ?? 0;
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HeroKpiCard
          label="Active Customers"
          value={formatNumber(payload.kpis.activeCustomers)}
          caption={`${formatNumber(payload.kpis.newCustomers)} new this period`}
          accent
        />
        <KpiCard label="Repeat Customers" value={formatNumber(payload.kpis.repeatCustomers)} />
        <KpiCard label="Repeat Rate" value={formatPercent(payload.kpis.repeatCustomerRate)} />
        <KpiCard
          label="Rebook Within 45d"
          value={formatPercent(payload.kpis.rebookingWithin45Rate)}
        />
        <KpiCard
          label="At-Risk (60d)"
          value={formatNumber(payload.kpis.atRiskCustomers60d)}
          caption="Haven't returned in 60 days"
        />
      </section>

      {anon > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <span className="text-base">⚠️</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-amber-900">
                Anonymous Walk-ins
              </h3>
              <p className="text-xs text-amber-900/80 mt-0.5 leading-relaxed">
                {formatCurrency(payload.kpis.anonymousWalkInRevenue ?? 0)} from{" "}
                {formatNumber(anon)} bookings (
                {formatPercent(
                  payload.kpis.anonymousWalkInShareOfBookings ?? 0,
                )}{" "}
                of bookings) had no contact info collected. Collecting phone or
                email on these would unlock re-engagement, history tracking,
                and rankings.
              </p>
            </div>
          </div>
        </section>
      )}

      <ChartSection title="Customer Activity Trend">
        <ReportTrendChart
          data={payload.trend}
          mode="number"
          series={[
            { dataKey: "newCustomers", label: "New Customers", color: "#2563eb" },
            { dataKey: "activeCustomers", label: "Active Customers", color: "#16a34a" },
            { dataKey: "repeatCustomers", label: "Repeat Customers", color: "#f59e0b" },
          ]}
        />
      </ChartSection>

      <TableShell title="Top Customers by Spend" empty={payload.topCustomers.length === 0}>
        <DataTable>
          <DataThead>
            <DataTh>Customer</DataTh>
            <DataTh>Bookings</DataTh>
            <DataTh right>Spend</DataTh>
          </DataThead>
          <tbody>
            {payload.topCustomers.map((row) => (
              <DataRow key={row.customerId}>
                <DataTd medium>{row.customerName}</DataTd>
                <DataTd muted>{row.bookings}</DataTd>
                <DataTd right>{formatCurrency(row.spend)}</DataTd>
              </DataRow>
            ))}
          </tbody>
        </DataTable>
      </TableShell>
    </div>
  );
}

function OperationsContent({ payload }: { payload: OperationsReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HeroKpiCard
          label="Completed Services"
          value={formatNumber(payload.kpis.completedServices)}
          caption={`${payload.kpis.staffContributors} staff contributors`}
          accent
        />
        <KpiCard label="Payroll Total" value={formatCurrency(payload.kpis.payrollTotal)} />
        <KpiCard
          label="Payroll Ratio"
          value={formatPercent(payload.kpis.payrollRatio)}
          caption="% of collected revenue"
        />
        <KpiCard label="Pending Queue" value={formatNumber(payload.kpis.pendingQueueCount)} />
        <KpiCard
          label="Median Pending Age"
          value={`${formatNumber(payload.kpis.medianPendingAgeHours)}h`}
        />
      </section>

      <ChartSection title="Operations Trend">
        <ReportTrendChart
          data={payload.trend}
          mode="number"
          series={[
            { dataKey: "completedServices", label: "Completed Services", color: "#2563eb" },
            { dataKey: "payroll", label: "Payroll", color: "#dc2626" },
          ]}
        />
      </ChartSection>

      <TableShell title="Staff Performance" empty={payload.staffPerformance.length === 0}>
        <DataTable>
          <DataThead>
            <DataTh>Provider</DataTh>
            <DataTh>Type</DataTh>
            <DataTh>Completed</DataTh>
            <DataTh right>Revenue</DataTh>
          </DataThead>
          <tbody>
            {payload.staffPerformance.map((row) => (
              <DataRow key={`${row.providerType}:${row.providerId}`}>
                <DataTd medium>{row.providerName}</DataTd>
                <DataTd muted>{row.providerType}</DataTd>
                <DataTd muted>{row.completedServices}</DataTd>
                <DataTd right>{formatCurrency(row.revenueContribution)}</DataTd>
              </DataRow>
            ))}
          </tbody>
        </DataTable>
      </TableShell>
    </div>
  );
}

const EXPENSE_CATEGORY_ICONS: Record<string, React.ElementType> = {
  SUPPLIES: ShoppingCart,
  UTILITIES: Zap,
  RENT: Home,
  EQUIPMENT: Wrench,
  MARKETING: Megaphone,
  MAINTENANCE: Settings,
  PROFESSIONAL: GraduationCap,
  MISCELLANEOUS: MoreHorizontal,
};

function ExpensesContent({ payload }: { payload: ExpensesReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <HeroKpiCard
          label="Total Expenses"
          value={formatCurrency(payload.kpis.totalExpenses)}
          caption={`${payload.kpis.entryCount} entries this period`}
          accent
        />
        <KpiCard
          label="Avg Per Day"
          value={formatCurrency(payload.kpis.avgPerDay)}
          caption="Daily average"
        />
        <KpiCard label="Top Category" value={payload.kpis.topCategory ?? "—"} />
        <KpiCard
          label="Expense / Revenue"
          value={
            payload.kpis.expenseToRevenueRatio > 0
              ? formatPercent(payload.kpis.expenseToRevenueRatio)
              : "—"
          }
          caption="% of collected revenue"
        />
      </section>

      {payload.kpis.entryCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No expenses logged</p>
          <p className="text-xs text-muted-foreground mt-1">
            Log expenses from the Owner Dashboard to track operating costs here.
          </p>
        </div>
      ) : (
        <>
          <ChartSection title="Expenses Over Time">
            <ReportTrendChart
              data={payload.trend}
              mode="currency"
              series={[{ dataKey: "total", label: "Total Expenses", color: "#dc2626" }]}
            />
          </ChartSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <TableShell title="By Category" empty={payload.byCategory.length === 0}>
              <DataTable>
                <DataThead>
                  <DataTh>Category</DataTh>
                  <DataTh>Entries</DataTh>
                  <DataTh right>Total</DataTh>
                </DataThead>
                <tbody>
                  {payload.byCategory.map((row) => {
                    const Icon = EXPENSE_CATEGORY_ICONS[row.category] ?? Receipt;
                    return (
                      <DataRow key={row.category}>
                        <DataTd medium>
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {row.categoryLabel}
                          </span>
                        </DataTd>
                        <DataTd muted>{row.count}</DataTd>
                        <DataTd right>{formatCurrency(row.total)}</DataTd>
                      </DataRow>
                    );
                  })}
                </tbody>
              </DataTable>
            </TableShell>

            <TableShell title="Expense Log" empty={payload.entries.length === 0}>
              <DataTable>
                <DataThead>
                  <DataTh>Date</DataTh>
                  <DataTh>Category</DataTh>
                  <DataTh>Note</DataTh>
                  <DataTh right>Amount</DataTh>
                </DataThead>
                <tbody>
                  {payload.entries.map((entry) => (
                    <DataRow key={entry.id}>
                      <DataTd muted>
                        {new Date(entry.date).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          timeZone: "Asia/Manila",
                        })}
                      </DataTd>
                      <DataTd medium>{entry.categoryLabel}</DataTd>
                      <DataTd muted>{entry.description ?? "—"}</DataTd>
                      <DataTd right>{formatCurrency(entry.amount)}</DataTd>
                    </DataRow>
                  ))}
                </tbody>
              </DataTable>
            </TableShell>
          </div>
        </>
      )}
    </div>
  );
}

function CohortsContent({ payload }: { payload: CohortsReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HeroKpiCard
          label="Cohort Customers"
          value={formatNumber(payload.kpis.cohortCustomers)}
          accent
        />
        <KpiCard label="Retained (30d)" value={formatNumber(payload.kpis.retainedCustomers30d)} />
        <KpiCard label="Retained (60d)" value={formatNumber(payload.kpis.retainedCustomers60d)} />
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

      <ChartSection title="Cohort Retention Trend">
        <ReportTrendChart
          data={payload.trend}
          mode="percent"
          series={[
            { dataKey: "retention30dRate", label: "30d Retention", color: "#2563eb" },
            { dataKey: "retention60dRate", label: "60d Retention", color: "#16a34a" },
          ]}
        />
      </ChartSection>

      <TableShell title="Top Cohort Segments" empty={payload.cohorts.length === 0}>
        <DataTable>
          <DataThead>
            <DataTh>Cohort</DataTh>
            <DataTh>Customers</DataTh>
            <DataTh>Retained 30d</DataTh>
            <DataTh>Retained 60d</DataTh>
            <DataTh right>30d Rate</DataTh>
            <DataTh right>Revenue</DataTh>
          </DataThead>
          <tbody>
            {payload.cohorts.map((row) => (
              <DataRow key={row.cohortKey}>
                <DataTd medium>{row.cohortLabel}</DataTd>
                <DataTd muted>{formatNumber(row.customers)}</DataTd>
                <DataTd muted>{formatNumber(row.retained30d)}</DataTd>
                <DataTd muted>{formatNumber(row.retained60d)}</DataTd>
                <DataTd right>{formatPercent(row.retention30dRate)}</DataTd>
                <DataTd right>{formatCurrency(row.revenue)}</DataTd>
              </DataRow>
            ))}
          </tbody>
        </DataTable>
      </TableShell>
    </div>
  );
}

function AttributionContent({ payload }: { payload: AttributionReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <HeroKpiCard
          label="Attribution Score"
          value={formatNumber(payload.kpis.attributionScore)}
          caption={`${payload.kpis.attributedBookings} attributed bookings`}
          accent
        />
        <KpiCard label="Campaigns" value={formatNumber(payload.kpis.campaigns)} />
        <KpiCard label="Published" value={formatNumber(payload.kpis.publishedCampaigns)} />
        <KpiCard label="Clicks" value={formatNumber(payload.kpis.clicks)} />
        <KpiCard label="Inquiries" value={formatNumber(payload.kpis.inquiries)} />
        <KpiCard label="Promo Redemptions" value={formatNumber(payload.kpis.promoRedemptions)} />
        <KpiCard
          label="Bookings / Published"
          value={formatPercent(payload.kpis.bookingsPerPublishedCampaign)}
        />
      </section>

      <ChartSection title="Campaign Attribution Trend">
        <ReportTrendChart
          data={payload.trend}
          mode="number"
          series={[
            { dataKey: "campaigns", label: "Campaigns", color: "#2563eb" },
            { dataKey: "attributedBookings", label: "Attributed Bookings", color: "#16a34a" },
            { dataKey: "promoRedemptions", label: "Promo Redemptions", color: "#f59e0b" },
          ]}
        />
      </ChartSection>

      <TableShell title="Top Attribution Segments" empty={payload.topSegments.length === 0}>
        <DataTable>
          <DataThead>
            <DataTh>Type</DataTh>
            <DataTh>Segment</DataTh>
            <DataTh>Campaigns</DataTh>
            <DataTh>Published</DataTh>
            <DataTh>Bookings</DataTh>
            <DataTh>Redemptions</DataTh>
            <DataTh right>Score</DataTh>
          </DataThead>
          <tbody>
            {payload.topSegments.map((row) => (
              <DataRow key={`${row.segmentType}:${row.segment}`}>
                <DataTd muted>
                  {row.segmentType === "OPPORTUNITY_TYPE" ? "Opportunity" : "Offer"}
                </DataTd>
                <DataTd medium>{formatEnumLabel(row.segment)}</DataTd>
                <DataTd muted>{formatNumber(row.campaigns)}</DataTd>
                <DataTd muted>{formatNumber(row.publishedCampaigns)}</DataTd>
                <DataTd muted>{formatNumber(row.attributedBookings)}</DataTd>
                <DataTd muted>{formatNumber(row.promoRedemptions)}</DataTd>
                <DataTd right>{formatNumber(row.attributionScore)}</DataTd>
              </DataRow>
            ))}
          </tbody>
        </DataTable>
      </TableShell>
    </div>
  );
}

function OpportunityRoiContent({ payload }: { payload: OpportunityRoiReportPayload }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HeroKpiCard
          label="Attributed Value"
          value={formatNumber(payload.kpis.attributedValue)}
          caption={`Baseline: ${formatCurrency(payload.kpis.baselineCollectedRevenue)}`}
          accent
        />
        <KpiCard label="Opportunities" value={formatNumber(payload.kpis.opportunities)} />
        <KpiCard label="Converted" value={formatNumber(payload.kpis.convertedOpportunities)} />
        <KpiCard label="Conversion Rate" value={formatPercent(payload.kpis.conversionRate)} />
        <KpiCard
          label="Avg Score"
          value={formatPercent(payload.kpis.averageOpportunityScore)}
        />
        <KpiCard
          label="Uplift vs Baseline"
          value={formatPercent(payload.kpis.upliftVsBaselineRate)}
        />
      </section>

      <ChartSection title="Opportunity ROI Trend">
        <ReportTrendChart
          data={payload.trend}
          mode="number"
          series={[
            { dataKey: "opportunities", label: "Opportunities", color: "#2563eb" },
            { dataKey: "convertedOpportunities", label: "Converted", color: "#16a34a" },
            { dataKey: "attributedValue", label: "Attributed Value", color: "#f59e0b" },
          ]}
        />
      </ChartSection>

      <TableShell title="Opportunity Type ROI" empty={payload.topOpportunities.length === 0}>
        <DataTable>
          <DataThead>
            <DataTh>Type</DataTh>
            <DataTh>Total</DataTh>
            <DataTh>Converted</DataTh>
            <DataTh>Rate</DataTh>
            <DataTh>Avg Score</DataTh>
            <DataTh right>Value</DataTh>
          </DataThead>
          <tbody>
            {payload.topOpportunities.map((row) => (
              <DataRow key={row.opportunityType}>
                <DataTd medium>{formatEnumLabel(row.opportunityType)}</DataTd>
                <DataTd muted>{formatNumber(row.opportunities)}</DataTd>
                <DataTd muted>{formatNumber(row.convertedOpportunities)}</DataTd>
                <DataTd muted>{formatPercent(row.conversionRate)}</DataTd>
                <DataTd muted>{formatPercent(row.averageScore)}</DataTd>
                <DataTd right>{formatNumber(row.attributedValue)}</DataTd>
              </DataRow>
            ))}
          </tbody>
        </DataTable>
      </TableShell>
    </div>
  );
}

// ── Main async loader ─────────────────────────────────────────

export async function ReportsTabContent({
  tab,
  range,
  businessId,
  actorId,
  advancedEnabled,
}: {
  tab: ReportTab;
  range: ReportDateRange;
  businessId: string;
  actorId: string;
  advancedEnabled: boolean;
}) {
  const isCoreTab = CORE_REPORT_TABS.includes(tab as CoreReportTab);
  const isAdvancedTab = !isCoreTab;

  let corePayload:
    | OverviewReportPayload
    | RevenueReportPayload
    | CustomersReportPayload
    | OperationsReportPayload
    | ExpensesReportPayload
    | null = null;
  let advancedPayload:
    | CohortsReportPayload
    | AttributionReportPayload
    | OpportunityRoiReportPayload
    | null = null;

  if (isCoreTab) {
    corePayload = await getCoreReportPayload({
      tab: tab as CoreReportTab,
      businessId,
      range,
    });
  } else if (advancedEnabled) {
    advancedPayload = await getAdvancedReportPayload({
      tab: tab as AdvancedReportTab,
      businessId,
      range,
    });
  }

  // Fire telemetry non-blocking
  void recordReportTelemetry({
    action: "REPORT_VIEW",
    actorId,
    businessId,
    tab,
    preset: range.preset,
    rangeStart: range.start,
    rangeEnd: range.end,
    groupBy: range.groupBy,
    latencyMs: 0,
    success: true,
    metadata: { advancedTab: isAdvancedTab, advancedAllowed: advancedEnabled },
  });

  return (
    <div className="pb-8">
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
      {tab === "expenses" && corePayload ? (
        <ExpensesContent payload={corePayload as ExpensesReportPayload} />
      ) : null}
      {tab === "cohorts" && advancedPayload && advancedEnabled ? (
        <CohortsContent payload={advancedPayload as CohortsReportPayload} />
      ) : null}
      {tab === "attribution" && advancedPayload && advancedEnabled ? (
        <AttributionContent payload={advancedPayload as AttributionReportPayload} />
      ) : null}
      {tab === "opportunity" && advancedPayload && advancedEnabled ? (
        <OpportunityRoiContent payload={advancedPayload as OpportunityRoiReportPayload} />
      ) : null}
      {isAdvancedTab && !advancedEnabled ? <AdvancedAccessMessage /> : null}
    </div>
  );
}
