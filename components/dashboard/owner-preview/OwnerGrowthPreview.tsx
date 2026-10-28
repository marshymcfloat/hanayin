"use client";

import { OwnerWorkspaceLink as Link } from "@/components/dashboard/owner-preview/OwnerWorkspaceLink";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp } from "lucide-react";
import type { GrowthPreviewData, GrowthPreviewRange } from "@/features/growth/queries/owner-preview";
import { ownerPreviewKeys, ownerPreviewStaleTime } from "./owner-preview-query";
import { useOwnerPreviewContext, useOwnerPreviewFetch } from "./OwnerPreviewQueryProvider";
import { OwnerPreviewRefreshControl } from "./OwnerPreviewRefreshControl";
import { OwnerPreviewContentSkeleton } from "./OwnerPreviewContentSkeleton";

const money = (value: number) => `₱${value.toLocaleString("en-PH")}`;
const labels: Record<string, string> = { revenue: "Revenue", bookings: "Bookings", customers: "New customers", retention: "Retention" };

export function OwnerGrowthPreview() {
  const identity = useOwnerPreviewContext();
  const previewFetch = useOwnerPreviewFetch();
  const [range, setRange] = useState<GrowthPreviewRange>("30d");
  const query = useQuery({
    queryKey: ownerPreviewKeys.section(identity, "growth", "page", { range }),
    queryFn: ({ signal }) => previewFetch<GrowthPreviewData>(
      `/api/owner-dashboard-preview/${encodeURIComponent(identity.businessSlug)}/growth?range=${range}`,
      { signal },
    ),
    staleTime: ownerPreviewStaleTime.growth,
    placeholderData: keepPreviousData,
  });

  const [lastSuccessful, setLastSuccessful] = useState<{ data: GrowthPreviewData; updatedAt: number } | null>(null);
  function selectRange(nextRange: GrowthPreviewRange) {
    if (query.data && !query.isPlaceholderData) {
      setLastSuccessful({ data: query.data, updatedAt: query.dataUpdatedAt });
    }
    setRange(nextRange);
  }

  if (!query.data && !lastSuccessful && query.isPending) return <OwnerPreviewContentSkeleton />;

  const view = query.data ?? lastSuccessful?.data;
  const showingPreviousRange = Boolean(view && view.range !== range);
  return <main className="min-h-dvh bg-[#F5F6F3] pb-24 text-[#20211F] md:pb-10 md:pl-[128px]">
    <div className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 md:px-8 md:py-9 xl:px-11">
      <Link href={`/owner-dashboard-preview/${identity.businessSlug}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#696C67]"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
      <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-[#696C67]">{identity.businessName} · Business planning</p><h1 className="mt-2 text-4xl font-bold tracking-tight">Growth</h1><p className="mt-2 text-sm text-[#696C67]">Track supported revenue, booking, and customer signals.</p></div>
        <label className="flex min-h-11 items-center gap-2 rounded-full border border-[#E1E3DE] bg-white px-3 text-xs font-semibold">Range<select value={range} onChange={(event) => selectRange(event.target.value as GrowthPreviewRange)} className="bg-transparent outline-none"><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option></select></label>
      </header>
      <div className="mt-5"><OwnerPreviewRefreshControl label="growth" isFetching={query.isFetching} updatedAt={query.dataUpdatedAt || lastSuccessful?.updatedAt || 0} error={query.isError ? "Growth refresh failed; showing saved data if available." : null} onRefresh={() => { void query.refetch(); }} /></div>
      {showingPreviousRange ? <p role={query.isError ? "alert" : "status"} className="mt-3 text-xs text-[#696C67]">{query.isError ? `The ${range} range could not be loaded. Previous range remains visible; retry above.` : `Showing the previous range while ${range} loads.`}</p> : null}
      {!view ? <div role="alert" className="mt-6 rounded-2xl bg-white p-6 text-sm text-[#C74248]">Growth data could not be loaded. Retry above.</div> : <>
        <section aria-label="Growth KPIs" className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">{view.kpis.map((kpi) => <article key={kpi.id} className="rounded-[24px] bg-white p-4 shadow-sm"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#EFF9E8] text-[#4D8F24]"><TrendingUp className="h-4 w-4" /></div><p className="mt-4 text-xs font-semibold text-[#696C67]">{labels[kpi.id]}</p><p className="mt-2 font-mono text-2xl font-semibold">{kpi.id === "revenue" ? money(kpi.value) : kpi.id === "retention" ? `${kpi.value}%` : kpi.value}</p><p className="mt-2 text-[11px] text-[#696C67]">{kpi.delta === null ? "Insufficient comparison data" : `${kpi.delta >= 0 ? "+" : ""}${kpi.delta}% vs prior period`}</p></article>)}</section>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"><section className="min-w-0 rounded-[28px] bg-white p-4 shadow-sm sm:p-6"><h2 className="text-lg font-bold">Performance trend</h2><p className="mt-1 text-xs text-[#696C67]">Completed-booking service revenue and unique customers.</p>{view.trend.length ? <div className="mt-6 overflow-x-auto"><div className="flex min-w-[620px] items-end gap-2" style={{ height: 240 }}>{view.trend.map((point) => <div key={point.label} className="flex h-full min-w-4 flex-1 flex-col justify-end gap-1"><div title={`${point.label}: ${money(point.revenue)}`} className="rounded-t bg-[#72CF35]" style={{ height: `${Math.max(4, Math.min(100, point.revenue / Math.max(...view.trend.map((item) => item.revenue), 1) * 100))}%` }} /><span className="text-center text-[9px] text-[#696C67]">{point.label}</span></div>)}</div></div> : <EmptyState />}</section><section className="rounded-[28px] bg-white p-4 shadow-sm sm:p-6"><h2 className="text-lg font-bold">Top services</h2><div className="mt-4 space-y-3">{view.topServices.length ? view.topServices.map((service) => <div key={service.name} className="flex items-center justify-between gap-3 border-b border-[#ECEEE9] pb-3 text-sm"><span className="min-w-0 truncate font-semibold">{service.name}</span><span className="shrink-0 text-[#696C67]">{money(service.revenue)}</span></div>) : <EmptyState />}</div></section></div>
      </>}
    </div>
  </main>;
}

function EmptyState() { return <p className="rounded-2xl bg-[#F7F8F5] p-4 text-sm text-[#696C67]">No supported activity in this range.</p>; }
