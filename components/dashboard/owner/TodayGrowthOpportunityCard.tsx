"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  CalendarClock,
  ChevronDown,
  Loader2,
  Megaphone,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";

import {
  getTodayGrowthOpportunitiesAction,
  refreshGrowthContextAction,
  refreshGrowthOpportunitiesAction,
} from "@/features/growth/actions/growth";
import type { OpportunityView } from "@/lib/services/growth/types";
import { isDiscountOffer } from "@/lib/services/growth/types";
import { buildGrowthFlowQuery } from "./growth/types";
import { cn } from "@/lib/utils";

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
  const [showDetails, setShowDetails] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const hasAutoRefreshed = useRef(false);

  useEffect(() => {
    if (!props.initialOpportunity && !hasAutoRefreshed.current) {
      hasAutoRefreshed.current = true;
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const hasDiscount = opportunity?.recommendedOfferTypes.some(isDiscountOffer);
  const ctaLabel = hasDiscount ? "Create Offer" : "Generate Post";

  return (
    <div className="p-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5 text-primary" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
            Growth
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isRefreshing}
          aria-label="Refresh growth opportunity"
          className="h-6 w-6 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          {isRefreshing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCcw className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Body */}
      {!opportunity ? (
        <div className="rounded-xl bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
          {isRefreshing ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking for opportunities...
            </span>
          ) : (
            "No growth opportunity detected for today."
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Score badge + reason */}
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full tabular-nums">
              {(opportunity.score * 100).toFixed(0)}%
            </span>
            <p className="text-xs font-medium text-foreground leading-snug">
              {opportunity.reason}
            </p>
          </div>

          {/* CTA */}
          <Link
            href={`/app/${props.businessSlug}/sale-events?${buildGrowthFlowQuery({
              step: 1,
              source: "dashboard",
              opportunityId: opportunity.id,
            })}`}
            className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Megaphone className="h-3 w-3" />
            {ctaLabel}
          </Link>

          {/* Collapsible details */}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform duration-200",
                showDetails && "rotate-180",
              )}
            />
            {showDetails ? "Hide details" : "Show details"}
          </button>

          {showDetails && (
            <div className="space-y-1.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-[10px] text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">Type:</span>{" "}
                {opportunity.type.replaceAll("_", " ")}
              </p>
              <p>
                <span className="font-semibold text-foreground">Confidence:</span>{" "}
                {(opportunity.confidence * 100).toFixed(0)}%
              </p>
              <p>
                <span className="font-semibold text-foreground">Window:</span>{" "}
                {formatDateTime(opportunity.timeWindowStart)} → {formatDateTime(opportunity.timeWindowEnd)}
              </p>
              {opportunity.recommendedOfferTypes.length > 0 && (
                <p>
                  <span className="font-semibold text-foreground">Action:</span>{" "}
                  {opportunity.recommendedOfferTypes.join(", ").replaceAll("_", " ")}
                </p>
              )}
              {opportunity.suggestedPostTimes.length > 0 && (
                <div className="space-y-0.5 pt-1 border-t border-border">
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    <CalendarClock className="h-2.5 w-2.5" />
                    Best times
                  </p>
                  {opportunity.suggestedPostTimes.slice(0, 3).map((t) => (
                    <p key={t}>{formatDateTime(t)}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
