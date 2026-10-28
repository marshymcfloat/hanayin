"use client";

import { useState } from "react";
import { OwnerWorkspaceLink as Link } from "@/components/dashboard/owner-preview/OwnerWorkspaceLink";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Download, ReceiptText, Settings2, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CoreReportTab } from "@/lib/types/reports";
import type { OwnerPreviewReportDto } from "@/features/reports/types/owner-preview";
import { cn } from "@/lib/utils";
import { ownerPreviewKeys, ownerPreviewStaleTime } from "./owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "./OwnerPreviewQueryProvider";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";
import { OwnerPreviewContentSkeleton } from "./OwnerPreviewContentSkeleton";
import { OwnerReportsStudy } from "@/components/dashboard/design-study/OwnerReportsStudy";
import { OwnerBusinessLoading } from "@/components/dashboard/design-study/OwnerBusinessLoading";

type ReportRange = "7d" | "30d" | "90d";
type Metric = { label: string; value: string; detail: string; tone: "lime" | "neutral" | "coral" | "dark" };
export type ReportView = {
  primaryLabel: string;
  secondaryLabel: string;
  primaryColor: string;
  secondaryColor: string;
  metrics: Metric[];
  trend: Array<{ label: string; primary: number; secondary: number }>;
  tableTitle: string;
  tableColumns: [string, string, string];
  tableRows: Array<[string, string, string]>;
  breakdownTitle: string;
  breakdown: Array<{ label: string; value: string; share: number }>;
};
type ReportResponse = OwnerPreviewReportDto;
type ReportData<Tab extends CoreReportTab> = Extract<OwnerPreviewReportDto, { tab: Tab }>["data"];

const tabs: Array<{ id: CoreReportTab; label: string; icon: LucideIcon; description: string }> = [
  { id: "overview", label: "Overview", icon: BarChart3, description: "A clear view of income, costs, bookings, and business performance." },
  { id: "revenue", label: "Revenue", icon: TrendingUp, description: "Track cash collected, future value booked, and average customer spend." },
  { id: "customers", label: "Customers", icon: Users, description: "Understand customer activity, repeat visits, and rebooking health." },
  { id: "operations", label: "Operations", icon: Settings2, description: "Review completed work, staff output, payroll, and pending service load." },
  { id: "expenses", label: "Expenses", icon: ReceiptText, description: "See operating costs, daily averages, and the categories driving spend." },
];
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const panel = "min-w-0 rounded-[24px] border border-white bg-white shadow-[0_18px_45px_rgba(32,33,31,0.045)] sm:rounded-[30px]";

function percentage(part: number, total: number) { return total > 0 ? Math.round((part / total) * 100) : 0; }

export function buildReportView(tab: CoreReportTab, payload: OwnerPreviewReportDto["data"]): ReportView {
  if (tab === "revenue") {
    const data = payload as ReportData<"revenue">;
    const kpi = data.kpis;
    const total = data.paymentMix.reduce((sum, row) => sum + row.collectedRevenue, 0);
    return {
      primaryLabel: "Collected revenue", secondaryLabel: "Outstanding balance", primaryColor: "#72CF35", secondaryColor: "#FF5B61",
      metrics: [
        { label: "Gross revenue", value: peso.format(kpi.grossRevenue), detail: "Before discounts", tone: "dark" },
        { label: "Collected revenue", value: peso.format(kpi.collectedRevenue), detail: `${percentage(kpi.collectedRevenue, kpi.grossRevenue)}% collected`, tone: "lime" },
        { label: "Average ticket", value: peso.format(kpi.averageTicket), detail: "From recorded bookings", tone: "neutral" },
        { label: "Discount rate", value: `${kpi.discountRate.toFixed(1)}%`, detail: "From recorded discounts", tone: "coral" },
      ],
      trend: data.trend.map((row) => ({ label: row.label, primary: row.collectedRevenue, secondary: Math.max(0, row.bookedRevenue - row.collectedRevenue) })),
      tableTitle: "Revenue by category", tableColumns: ["Category", "Bookings", "Revenue"],
      tableRows: data.topCategories.slice(0, 8).map((row) => [row.category, String(row.bookings), peso.format(row.revenue)] as [string, string, string]),
      breakdownTitle: "Payment mix", breakdown: data.paymentMix.map((row) => ({ label: row.method, value: peso.format(row.collectedRevenue), share: percentage(row.collectedRevenue, total) })),
    };
  }
  if (tab === "customers") {
    const data = payload as ReportData<"customers">;
    const kpi = data.kpis;
    return {
      primaryLabel: "Active customers", secondaryLabel: "Repeat customers", primaryColor: "#72CF35", secondaryColor: "#20211F",
      metrics: [
        { label: "Active customers", value: String(kpi.activeCustomers), detail: `${kpi.newCustomers} new in range`, tone: "lime" },
        { label: "Repeat customers", value: String(kpi.repeatCustomers), detail: `${kpi.repeatCustomerRate.toFixed(1)}% repeat rate`, tone: "dark" },
        { label: "Rebooked in 45 days", value: `${kpi.rebookingWithin45Rate.toFixed(1)}%`, detail: "From customer history", tone: "neutral" },
        { label: "At-risk customers", value: String(kpi.atRiskCustomers60d), detail: "No visit in 60 days", tone: "coral" },
      ],
      trend: data.trend.map((row) => ({ label: row.label, primary: row.activeCustomers, secondary: row.repeatCustomers })),
      tableTitle: "Top customers by spend", tableColumns: ["Customer", "Bookings", "Spend"],
      tableRows: data.topCustomers.slice(0, 8).map((row) => [row.customerName, String(row.bookings), peso.format(row.spend)] as [string, string, string]),
      breakdownTitle: "Customer mix", breakdown: [
        { label: "New", value: String(kpi.newCustomers), share: percentage(kpi.newCustomers, kpi.activeCustomers) },
        { label: "Repeat", value: String(kpi.repeatCustomers), share: percentage(kpi.repeatCustomers, kpi.activeCustomers) },
      ],
    };
  }
  if (tab === "operations") {
    const data = payload as ReportData<"operations">;
    const kpi = data.kpis;
    return {
      primaryLabel: "Completed services", secondaryLabel: "Payroll", primaryColor: "#72CF35", secondaryColor: "#20211F",
      metrics: [
        { label: "Completed services", value: String(kpi.completedServices), detail: `Across ${kpi.staffContributors} contributors`, tone: "lime" },
        { label: "Completion rate", value: `${percentage(kpi.completedServices, kpi.completedServices + kpi.pendingQueueCount)}%`, detail: "Compared with current queue", tone: "dark" },
        { label: "Payroll total", value: peso.format(kpi.payrollTotal), detail: `${kpi.payrollRatio.toFixed(1)}% of collections`, tone: "neutral" },
        { label: "Pending queue", value: String(kpi.pendingQueueCount), detail: `${kpi.medianPendingAgeHours.toFixed(1)}h median age`, tone: "coral" },
      ],
      trend: data.trend.map((row) => ({ label: row.label, primary: row.completedServices, secondary: row.payroll })),
      tableTitle: "Staff performance", tableColumns: ["Team member", "Completed", "Revenue"],
      tableRows: data.staffPerformance.slice(0, 8).map((row) => [row.providerName, String(row.completedServices), peso.format(row.revenueContribution)] as [string, string, string]),
      breakdownTitle: "Service load", breakdown: [
        { label: "Completed", value: String(kpi.completedServices), share: percentage(kpi.completedServices, kpi.completedServices + kpi.pendingQueueCount) },
        { label: "Pending", value: String(kpi.pendingQueueCount), share: percentage(kpi.pendingQueueCount, kpi.completedServices + kpi.pendingQueueCount) },
      ],
    };
  }
  if (tab === "expenses") {
    const data = payload as ReportData<"expenses">;
    const kpi = data.kpis;
    return {
      primaryLabel: "Expenses", secondaryLabel: "Entries", primaryColor: "#FF5B61", secondaryColor: "#20211F",
      metrics: [
        { label: "Total expenses", value: peso.format(kpi.totalExpenses), detail: `${kpi.expenseToRevenueRatio.toFixed(1)}% of revenue`, tone: "coral" },
        { label: "Expense entries", value: String(kpi.entryCount), detail: "Recorded entries", tone: "dark" },
        { label: "Daily average", value: peso.format(kpi.avgPerDay), detail: "Within selected range", tone: "lime" },
        { label: "Top category", value: kpi.topCategory ?? "None", detail: "Largest recorded category", tone: "neutral" },
      ],
      trend: data.trend.map((row) => ({ label: row.label, primary: row.total, secondary: row.count })),
      tableTitle: "Largest expense entries", tableColumns: ["Expense", "Category", "Amount"],
      tableRows: data.entries.slice(0, 8).map((row) => [row.description || row.categoryLabel, row.categoryLabel, peso.format(row.amount)] as [string, string, string]),
      breakdownTitle: "Expense categories", breakdown: data.byCategory.map((row) => ({ label: row.categoryLabel, value: peso.format(row.total), share: percentage(row.total, kpi.totalExpenses) })),
    };
  }
  const data = payload as ReportData<"overview">;
  const kpi = data.kpis;
  return {
    primaryLabel: "Booked revenue", secondaryLabel: "Collected revenue", primaryColor: "#72CF35", secondaryColor: "#20211F",
    metrics: [
      { label: "Collected revenue", value: peso.format(kpi.collectedRevenue), detail: `${kpi.totalBookings} bookings in range`, tone: "lime" },
      { label: "Booked revenue", value: peso.format(kpi.bookedRevenue), detail: `${peso.format(kpi.outstandingBalance)} outstanding`, tone: "dark" },
      { label: "Total expenses", value: peso.format(kpi.totalExpenses), detail: "Recorded expenses", tone: "coral" },
      { label: "True net profit", value: peso.format(kpi.trueNetProfit), detail: `${kpi.completionRate.toFixed(1)}% completion rate`, tone: "lime" },
    ],
    trend: data.trend.map((row) => ({ label: row.label, primary: row.bookedRevenue, secondary: row.collectedRevenue })),
    tableTitle: "Top services by revenue", tableColumns: ["Service", "Bookings", "Revenue"],
    tableRows: data.topServices.slice(0, 8).map((row) => [row.serviceName, String(row.timesBooked), peso.format(row.revenue)] as [string, string, string]),
    breakdownTitle: "Booking volume", breakdown: Object.entries(data.bookingVolume).map(([label, value]) => ({ label, value: String(value), share: percentage(value, kpi.totalBookings) })),
  };
}

export function OwnerReportsPreview({ redesign = false }: { redesign?: boolean }) {
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const [tab, setTab] = useState<CoreReportTab>("overview");
  const [range, setRange] = useState<ReportRange>("30d");
  const [groupBy] = useState<"day">("day");
  const query = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "reports", "page", { tab, range, groupBy }),
    queryFn: ({ signal }) => previewFetch<ReportResponse>(
      `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/reports?tab=${tab}&preset=${range}&groupBy=${groupBy}`,
      { signal },
    ),
    staleTime: ownerPreviewStaleTime.reports,
    placeholderData: keepPreviousData,
  });
  const [lastSuccessful, setLastSuccessful] = useState<{ data: ReportResponse; updatedAt: number } | null>(null);
  function selectReport(nextTab: CoreReportTab, nextRange: ReportRange) {
    if (query.data && !query.isPlaceholderData) {
      setLastSuccessful({ data: query.data, updatedAt: query.dataUpdatedAt });
    }
    setTab(nextTab);
    setRange(nextRange);
  }
  if (!query.data && !lastSuccessful && query.isPending) return redesign ? <OwnerBusinessLoading page="reports" /> : <OwnerPreviewContentSkeleton />;

  const response = query.data ?? lastSuccessful?.data;
  const showingPreviousSelection = Boolean(response && (response.tab !== tab || response.range.preset !== range));
  const view = response?.data?.kpis ? buildReportView(response.tab, response.data) : null;
  const displayedTab = response?.tab ?? tab;
  const selected = tabs.find((item) => item.id === tab);
  const exportUnavailableReason = tab === "expenses"
    ? "Expenses export is not available yet."
    : !view || showingPreviousSelection
      ? "Export is available after the selected report loads."
      : null;

  if (redesign) {
    // A current queue and completed work in a historical range are not a completion-rate denominator.
    const redesignedView = view && response?.tab === "operations" ? { ...view, metrics: view.metrics.map((metric, index) => index === 1 ? { ...metric, label: "Staff contributors", value: String(response.data.kpis.staffContributors), detail: "With completed work in range" } : metric) } : view;
    return <OwnerReportsStudy tab={tab} range={range} displayedTab={displayedTab} period={response?.range.label ?? "Selected reporting period"} view={redesignedView} previous={showingPreviousSelection} failed={query.isError} fetching={query.isFetching} exportReason={exportUnavailableReason} exportHref={`/api/reports/export?businessSlug=${encodeURIComponent(identity.businessSlug)}&tab=${tab}&format=xlsx&preset=${range}&groupBy=${groupBy}`} onSelect={selectReport} onRefresh={() => { void query.refetch(); }} />;
  }

  return <main className="min-h-dvh bg-[#F5F6F3] pb-[calc(5.5rem+env(safe-area-inset-bottom))] font-[var(--font-body)] text-[#20211F] md:pb-10 md:pl-[128px]">
    <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><Link href={`/owner-dashboard-preview/${identity.businessSlug}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#696C67]"><ArrowLeft className="h-4 w-4" />Dashboard</Link><p className="text-sm font-semibold text-[#696C67]">{identity.businessName} · Business intelligence</p><h1 className="mt-2 text-[clamp(1.9rem,3vw,2.6rem)] font-bold leading-tight tracking-[-0.035em]">Reports</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#696C67] sm:text-base">{selected?.description}</p></div><div className="self-start sm:self-auto">{exportUnavailableReason ? <button type="button" disabled aria-describedby="report-export-unavailable" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#E1E3DE] bg-white px-4 text-xs font-bold text-[#696C67] opacity-60"><Download className="h-4 w-4" />Export report</button> : <a href={`/api/reports/export?businessSlug=${encodeURIComponent(identity.businessSlug)}&tab=${tab}&format=xlsx&preset=${range}&groupBy=${groupBy}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#E1E3DE] bg-white px-4 text-xs font-bold"><Download className="h-4 w-4" />Export report</a>}{exportUnavailableReason ? <p id="report-export-unavailable" className="mt-1 max-w-52 text-xs text-[#696C67]">{exportUnavailableReason}</p> : null}</div></header>
      <section aria-label="Report controls" className={cn(panel, "mt-7 p-3 sm:p-4")}><div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Report sections">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" role="tab" aria-selected={item.id === tab} onClick={() => selectReport(item.id, range)} className={cn("inline-flex min-h-11 min-w-0 flex-[1_1_calc(50%_-_0.1875rem)] items-center justify-center gap-2 rounded-[14px] px-3.5 text-xs font-bold sm:flex-none", item.id === tab ? "bg-[#20211F] text-white" : "text-[#696C67] hover:bg-[#F5F6F3]")}><Icon className="h-4 w-4" />{item.label}</button>; })}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#ECEEE9] pt-3"><p className="text-xs font-semibold text-[#696C67]">{response?.range.label ?? "Selected reporting period"}</p><div className="grid grid-cols-3 rounded-[14px] bg-[#F1F2EF] p-1" aria-label="Report date range">{(["7d", "30d", "90d"] as ReportRange[]).map((item) => <button key={item} type="button" aria-pressed={range === item} onClick={() => selectReport(tab, item)} className={cn("min-h-11 rounded-[11px] px-4 text-xs font-bold", range === item ? "bg-white text-[#20211F] shadow-sm" : "text-[#696C67]")}>{item.toUpperCase()}</button>)}</div></div></section>
      <div className="mt-5"><OwnerPreviewRefreshControl label="reports" isFetching={query.isFetching} updatedAt={query.dataUpdatedAt || lastSuccessful?.updatedAt || 0} error={query.isError ? "Report refresh failed; showing saved data if available." : null} onRefresh={() => { void query.refetch(); }} /></div>
      {showingPreviousSelection ? <p role={query.isError ? "alert" : "status"} className="mt-3 text-xs text-[#696C67]">{query.isError ? "The selected report could not be loaded. Previous report remains visible; retry above." : "Showing the previous report while the selected report loads."}</p> : null}
      {!view ? <div role="alert" className="mt-5 rounded-2xl bg-white p-6 text-sm text-[#C74248]">The report could not be loaded. Retry above.</div> : <>
        <section aria-label={`${tabs.find((item) => item.id === displayedTab)?.label} key metrics`} className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{view.metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</section>
        <section className={cn(panel, "mt-5 overflow-hidden p-4 sm:p-5")} aria-labelledby="trend-title"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="trend-title" className="text-lg font-bold">Performance trend</h2><p className="mt-1 text-xs text-[#696C67]">{response?.range.label}</p></div><div className="flex gap-3 text-[11px] font-semibold text-[#696C67]"><Legend color={view.primaryColor} label={view.primaryLabel} /><Legend color={view.secondaryColor} label={view.secondaryLabel} /></div></div>{view.trend.length ? <><div className="mt-4 h-[260px] w-full sm:h-[340px] lg:h-[400px]" role="img" aria-label={`${view.primaryLabel} and ${view.secondaryLabel} trend`}><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}><ComposedChart data={view.trend} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}><defs><linearGradient id="report-primary-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={view.primaryColor} stopOpacity={0.24} /><stop offset="100%" stopColor={view.primaryColor} stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#E7E9E4" strokeDasharray="4 5" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#81847E", fontSize: 10 }} minTickGap={18} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#81847E", fontSize: 10 }} width={58} tickFormatter={(value: number) => value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)} /><Tooltip /><Area type="monotone" dataKey="primary" stroke={view.primaryColor} strokeWidth={3} fill="url(#report-primary-fill)" /><Bar dataKey="secondary" fill={view.secondaryColor} opacity={0.18} radius={[5, 5, 0, 0]} maxBarSize={32} /></ComposedChart></ResponsiveContainer></div><div className="sr-only"><table><caption>{view.primaryLabel} and {view.secondaryLabel} by period</caption><thead><tr><th>Period</th><th>{view.primaryLabel}</th><th>{view.secondaryLabel}</th></tr></thead><tbody>{view.trend.map((point) => <tr key={point.label}><th>{point.label}</th><td>{point.primary}</td><td>{point.secondary}</td></tr>)}</tbody></table></div></> : <EmptyState label="No trend activity in this range." />}</section>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)]"><section className={cn(panel, "overflow-hidden")} aria-labelledby="ranking-title"><div className="border-b border-[#ECEEE9] p-4 sm:p-5"><h2 id="ranking-title" className="text-base font-bold">{view.tableTitle}</h2><p className="mt-1 text-xs text-[#696C67]">Ranked for the selected reporting period.</p></div>{view.tableRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-[#ECEEE9] text-[10px] font-semibold uppercase tracking-[0.07em] text-[#696C67]">{view.tableColumns.map((column) => <th key={column} scope="col" className="px-5 py-3">{column}</th>)}</tr></thead><tbody>{view.tableRows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-b border-[#ECEEE9] last:border-0"><td className="px-5 py-4 font-semibold">{row[0]}</td><td className="px-5 py-4 text-[#696C67]">{row[1]}</td><td className="px-5 py-4 font-mono font-semibold">{row[2]}</td></tr>)}</tbody></table></div> : <EmptyState label="No ranked records in this range." />}</section><section className={cn(panel, "p-4 sm:p-5")} aria-labelledby="breakdown-title"><h2 id="breakdown-title" className="text-base font-bold">{view.breakdownTitle}</h2>{view.breakdown.length ? <dl className="mt-5 space-y-4">{view.breakdown.map((item) => <div key={item.label}><div className="flex items-baseline justify-between gap-4"><dt className="text-xs font-semibold text-[#555852]">{item.label}</dt><dd className="font-mono text-xs font-semibold">{item.value}</dd></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ECEEE9]"><div className="h-full rounded-full bg-[#72CF35]" style={{ width: `${item.share}%` }} /></div><p className="mt-1 text-right font-mono text-[10px] text-[#696C67]">{item.share}%</p></div>)}</dl> : <EmptyState label="No breakdown available in this range." />}</section></div>
      </>}
    </div>
  </main>;
}

function MetricCard({ metric }: { metric: Metric }) {
  const tone = metric.tone === "lime" ? "bg-[#EFF9E8] text-[#4D8F24]" : metric.tone === "coral" ? "bg-[#FFF0F0] text-[#D94850]" : metric.tone === "dark" ? "bg-[#20211F] text-white" : "bg-[#F0F1EE] text-[#424440]";
  return <article className="min-w-0 rounded-[26px] border border-white bg-white p-4 shadow-sm lg:p-[18px]"><span className={cn("grid h-9 w-9 place-items-center rounded-[12px]", tone)}><TrendingUp className="h-[17px] w-[17px]" aria-hidden="true" /></span><h2 className="mt-4 text-xs font-semibold text-[#696C67]">{metric.label}</h2><p className="mt-2 break-words font-mono text-[clamp(1.35rem,2.15vw,2.1rem)] font-semibold leading-none tracking-[-0.055em]">{metric.value}</p><p className="mt-2.5 text-[11px] leading-4 text-[#696C67]">{metric.detail}</p></article>;
}
function Legend({ color, label }: { color: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />{label}</span>; }
function EmptyState({ label }: { label: string }) { return <p className="m-4 rounded-2xl bg-[#F7F8F5] p-4 text-sm text-[#696C67]">{label}</p>; }
