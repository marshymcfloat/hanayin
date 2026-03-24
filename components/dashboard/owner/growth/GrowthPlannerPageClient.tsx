"use client";

import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MonthlyPlannerEventType } from "@/lib/services/growth/monthly-planner";
import type { OfferTypeLiteral } from "@/lib/services/growth/types";

type SerializedEvent = {
  id: string;
  date: string;
  name: string;
  type: MonthlyPlannerEventType;
  suggestedActionTypes: OfferTypeLiteral[];
  existingCampaignId: string | null;
  existingCampaignStatus: string | null;
};

type Props = {
  businessSlug: string;
  businessName: string;
  events: SerializedEvent[];
  year: number;
  month: number;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TYPE_STYLES: Record<MonthlyPlannerEventType, { bg: string; text: string; border: string }> = {
  HOLIDAY: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  FESTIVAL: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  ACADEMIC: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  SEASONAL: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  PAYDAY: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  LOCAL_EVENT: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  ANNIVERSARY: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  WEEKEND: { bg: "bg-zinc-50", text: "text-zinc-600", border: "border-zinc-200" },
};

function formatEventDate(isoDate: string) {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatActionLabel(action: OfferTypeLiteral): string {
  return action.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function GrowthPlannerPageClient({ businessSlug, businessName, events, year, month }: Props) {
  const router = useRouter();

  const navigateMonth = (direction: -1 | 1) => {
    let newMonth = month + direction;
    let newYear = year;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    router.push(`/app/${businessSlug}/growth?year=${newYear}&month=${newMonth}`);
  };

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-zinc-100 bg-white p-2.5 shadow-sm">
            <TrendingUp className="size-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Growth Planner</h1>
            <p className="text-xs text-zinc-500">{businessName}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-zinc-100 bg-white px-5 py-3 shadow-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateMonth(-1)}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-900">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          {isCurrentMonth && (
            <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-700 bg-emerald-50">
              Current
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateMonth(1)}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-16 text-center">
          <CalendarDays className="mb-3 size-8 text-zinc-300" />
          <h3 className="text-sm font-semibold text-zinc-700">
            No growth events this month
          </h3>
          <p className="mt-1 max-w-xs text-xs text-zinc-500">
            Try navigating to a month with holidays, paydays, or seasonal events.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const style = TYPE_STYLES[event.type];
            const hasCampaign = !!event.existingCampaignId;

            return (
              <div
                key={event.id}
                className={`rounded-xl border ${style.border} ${style.bg} px-4 py-3 transition-all`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-zinc-500">
                        {formatEventDate(event.date)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-medium ${style.text} ${style.border} ${style.bg}`}
                      >
                        {event.type.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className={`mt-1 text-sm font-semibold ${style.text}`}>
                      {event.name}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Suggested: {event.suggestedActionTypes.map(formatActionLabel).join(", ")}
                    </p>
                  </div>

                  <div className="shrink-0 pt-1">
                    {hasCampaign ? (
                      <div className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
                        <CheckCircle2 className="size-3 text-emerald-600" />
                        <span className="text-[11px] font-medium text-emerald-700">
                          {event.existingCampaignStatus === "PUBLISHED" ? "Published" : "Draft"}
                        </span>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => {
                          router.push(
                            `/app/${businessSlug}/sale-events?flow=growth&step=1&source=planner`,
                          );
                        }}
                      >
                        <Sparkles className="size-3" />
                        Generate Draft
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Clock className="size-3" />
          <span>
            {events.length} events this month
            {events.filter((e) => e.existingCampaignId).length > 0 && (
              <> · {events.filter((e) => e.existingCampaignId).length} with campaigns</>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
