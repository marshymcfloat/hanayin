import { Suspense } from "react";
import {
  BarChart2,
  TrendingUp,
  Users,
  Settings,
  Receipt,
  Layers,
  Share2,
  Zap,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildReportQueryString,
  parseReportDateRange,
  parseReportTab,
} from "@/lib/services/reports/date-range";
import { ReportsTabContent } from "@/components/dashboard/reports/ReportsTabContent";
import { ReportsTabSkeleton } from "@/components/dashboard/reports/ReportsTabSkeleton";
import { getReportsWorkspaceData } from "@/features/reports/queries/workspace";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReportDateRange, ReportTab } from "@/lib/types/reports";

function getSingleParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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

const TAB_META: Array<{
  id: ReportTab;
  label: string;
  icon: React.ElementType;
  advanced?: boolean;
}> = [
  { id: "overview", label: "Overview", icon: BarChart2 },
  { id: "revenue", label: "Revenue", icon: TrendingUp },
  { id: "customers", label: "Customers", icon: Users },
  { id: "operations", label: "Operations", icon: Settings },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "cohorts", label: "Cohorts", icon: Layers, advanced: true },
  { id: "attribution", label: "Attribution", icon: Share2, advanced: true },
  { id: "opportunity", label: "Opp. ROI", icon: Zap, advanced: true },
];

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, rawSearchParams] = await Promise.all([params, searchParams]);

  const data = await getReportsWorkspaceData(businessSlug);
  if (!data.success) redirect(data.error === "Unauthorized" ? "/" : `/app/${businessSlug}`);
  const { business } = data;

  const tab = parseReportTab(getSingleParam(rawSearchParams.tab));
  const range = parseReportDateRange({
    preset: getSingleParam(rawSearchParams.preset),
    start: getSingleParam(rawSearchParams.start),
    end: getSingleParam(rawSearchParams.end),
    groupBy: getSingleParam(rawSearchParams.groupBy),
  });

  const exportHref = buildExportHref({ businessSlug, tab, range });

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Sticky header ──────────────────────────────────── */}
      <header className="shrink-0 sticky top-0 z-20 bg-card border-b border-border">
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-3 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart2 className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground leading-none truncate">Reports</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate hidden sm:block">
                {business.name} · {range.label}
              </p>
            </div>
          </div>
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent/30 transition-colors cursor-pointer shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </a>
        </div>
      </header>

      {/* ── Scrollable body ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-5">

          {/* ── Tabs — horizontally scrollable on mobile ─── */}
          <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
            <div className="flex items-center gap-1.5 min-w-max">
              {TAB_META.map((item) => {
                const isActive = tab === item.id;
                const isBlocked = item.advanced && !data.reportsAdvanced;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={buildTabHref(item.id, range)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : isBlocked
                        ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "border-border bg-card text-foreground hover:bg-accent/30",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* ── Date range controls ─────────────────────── */}
          <section className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3">
            <div className="overflow-x-auto -mx-1">
              <div className="flex items-center gap-1.5 min-w-max px-1">
                {(["today", "7d", "30d", "90d", "mtd"] as const).map((preset) => (
                  <Link
                    key={preset}
                    href={buildPresetHref({ tab, preset })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors cursor-pointer",
                      range.preset === preset
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent/30",
                    )}
                  >
                    {preset}
                  </Link>
                ))}
              </div>
            </div>

            <form className="grid gap-2 grid-cols-2 sm:grid-cols-6">
              <input type="hidden" name="tab" value={tab} />
              <input type="hidden" name="preset" value="custom" />
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
                Start Date
                <input
                  name="start"
                  type="date"
                  defaultValue={range.start}
                  className="h-9 rounded-xl border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
                End Date
                <input
                  name="end"
                  type="date"
                  defaultValue={range.end}
                  className="h-9 rounded-xl border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Group By
                <select
                  name="groupBy"
                  defaultValue={range.groupBy}
                  className="h-9 rounded-xl border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </label>
              <div className="flex items-end">
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full rounded-xl cursor-pointer h-9 text-xs"
                >
                  Apply
                </Button>
              </div>
            </form>
          </section>

          {/* ── Tab content — streamed behind Suspense ────── */}
          <Suspense fallback={<ReportsTabSkeleton />}>
            <ReportsTabContent
              tab={tab}
              range={range}
              businessId={business.id}
              actorId={data.actorId}
              advancedEnabled={data.reportsAdvanced}
            />
          </Suspense>

        </div>
      </div>
    </div>
  );
}
