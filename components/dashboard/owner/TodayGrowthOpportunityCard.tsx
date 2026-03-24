"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  Megaphone,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";

import {
  getTodayGrowthOpportunitiesAction,
  refreshGrowthContextAction,
  refreshGrowthOpportunitiesAction,
} from "@/lib/server actions/growth";
import type { OpportunityView } from "@/lib/services/growth/types";
import { isDiscountOffer } from "@/lib/services/growth/types";
import { buildGrowthFlowQuery } from "./growth/types";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TodayGrowthOpportunityCard(props: {
  businessSlug: string;
  initialOpportunity: OpportunityView | null;
}) {
  const [opportunity, setOpportunity] = useState<OpportunityView | null>(
    props.initialOpportunity,
  );
  const [showSchedule, setShowSchedule] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const hasAutoRefreshed = useRef(false);

  useEffect(() => {
    if (!props.initialOpportunity && !hasAutoRefreshed.current) {
      hasAutoRefreshed.current = true;
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capacitySummary = useMemo(() => {
    if (!opportunity?.metadata) return null;
    const openSlots =
      typeof opportunity.metadata.openSlots === "number"
        ? opportunity.metadata.openSlots
        : null;
    const capacity =
      typeof opportunity.metadata.estimatedCapacitySlots === "number"
        ? opportunity.metadata.estimatedCapacitySlots
        : null;
    if (openSlots === null || capacity === null) return null;
    return { openSlots, capacity };
  }, [opportunity]);

  const refresh = () => {
    startRefresh(async () => {
      const context = await refreshGrowthContextAction(props.businessSlug);
      if (!context.success) {
        toast.error(context.error || "Failed to refresh context.");
        return;
      }
      const opportunities = await refreshGrowthOpportunitiesAction(props.businessSlug);
      if (!opportunities.success) {
        toast.error(opportunities.error || "Failed to refresh opportunities.");
        return;
      }
      const today = await getTodayGrowthOpportunitiesAction(props.businessSlug);
      if (!today.success) {
        toast.error(today.error || "Failed to load opportunities.");
        return;
      }
      setOpportunity(today.data[0] || null);
      toast.success("Growth opportunity refreshed.");
    });
  };

  return (
    <article className="rounded-[24px] border border-zinc-100 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-zinc-900">
            Today&apos;s Growth Opportunity
          </h3>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCcw className="size-3" />
          )}
          Refresh
        </button>
      </div>

      {!opportunity ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-600">
          {isRefreshing ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-3 animate-spin" />
              Checking for today&apos;s growth opportunities...
            </span>
          ) : (
            "No growth opportunity detected for today."
          )}
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm font-medium text-zinc-900">{opportunity.reason}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {opportunity.type.replaceAll("_", " ")} | Score{" "}
            {(opportunity.score * 100).toFixed(0)}% | Confidence{" "}
            {(opportunity.confidence * 100).toFixed(0)}%
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Window: {formatDateTime(opportunity.timeWindowStart)} to{" "}
            {formatDateTime(opportunity.timeWindowEnd)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Suggested action:{" "}
            {opportunity.recommendedOfferTypes.join(", ").replaceAll("_", " ")}
            {opportunity.recommendedOfferTypes.length > 0 &&
              !opportunity.recommendedOfferTypes.some(isDiscountOffer) && (
              <span className="ml-1.5 inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-200">
                No discount
              </span>
            )}
          </p>

          {capacitySummary ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
              <p className="text-xs font-semibold text-emerald-800">
                Capacity check: {capacitySummary.openSlots} open slots out of{" "}
                {capacitySummary.capacity}
              </p>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/app/${props.businessSlug}/sale-events?${buildGrowthFlowQuery({
                step: 1,
                source: "dashboard",
                opportunityId: opportunity.id,
              })}`}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <Megaphone className="size-3" />
              {opportunity.recommendedOfferTypes.some(isDiscountOffer)
                ? "Start Step 1: Create Offer"
                : "Generate Social Post"}
            </Link>
            <button
              type="button"
              onClick={() => setShowSchedule((value) => !value)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
            >
              <CalendarClock className="size-3" />
              Best times
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            You&apos;ll create the offer first, then review post before publishing.
          </p>

          {showSchedule ? (
            <div className="mt-3 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              {opportunity.suggestedPostTimes.length === 0 ? (
                <p className="text-xs text-zinc-600">
                  No future timestamps available for this window.
                </p>
              ) : (
                opportunity.suggestedPostTimes.map((entry) => (
                  <p key={entry} className="text-xs text-zinc-700">
                    <CalendarClock className="mr-1 inline size-3 text-zinc-500" />
                    {formatDateTime(entry)}
                  </p>
                ))
              )}
            </div>
          ) : null}

          {opportunity.metadata && typeof opportunity.metadata.risk === "string" ? (
            <p className="mt-3 text-xs text-amber-700">
              <AlertTriangle className="mr-1 inline size-3" />
              Risk flag: {opportunity.metadata.risk}
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}
