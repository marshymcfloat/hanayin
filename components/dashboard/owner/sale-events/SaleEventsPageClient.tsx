"use client";

import { useRef, useState } from "react";
import { CreateSaleEventDialog } from "./CreateSaleEventDialog";
import { SaleEventList, type SaleEvent } from "./SaleEventList";
import { deleteSaleEvent } from "@/lib/server actions/sale-event";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Percent, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SocialPlatform } from "@/prisma/generated/prisma/enums";
import type { OpportunityView } from "@/lib/services/growth/types";
import { GrowthOpportunityPanel } from "./GrowthOpportunityPanel";
import { GrowthFlowChecklist } from "../growth/GrowthFlowChecklist";
import type { GrowthFlowContext } from "../growth/types";

interface SaleEventsPageClientProps {
  businessSlug: string;
  initialEvents: SaleEvent[];
  services: { id: number; name: string; category: string }[];
  packages: { id: number; name: string }[];
  initialOpportunity: OpportunityView | null;
  connectedPlatforms: SocialPlatform[];
  socialPublishingEnabled: boolean;
  growthEnabled: boolean;
  growthAiEnabled: boolean;
  socialEnabled: boolean;
  flowContext?: GrowthFlowContext;
}

export function SaleEventsPageClient({
  businessSlug,
  initialEvents,
  services,
  packages,
  initialOpportunity,
  connectedPlatforms,
  socialPublishingEnabled,
  growthEnabled,
  growthAiEnabled,
  socialEnabled,
  flowContext,
}: SaleEventsPageClientProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConfirmedEvent =
    initialEvents.length > 0 || typeof flowContext?.saleEventId === "number";
  const activeStep = flowContext?.step ?? (hasConfirmedEvent ? 2 : 1);

  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    router.refresh();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setIsRefreshing(false), 1200);
  };

  const handleDelete = async (id: number) => {
    try {
      const result = await deleteSaleEvent(id, businessSlug);
      if (result.success) {
        toast.success("Sale event deleted");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to delete sale event");
      }
    } catch {
      toast.error("An unexpected error occurred");
    }
  };

  return (
    <div className="flex flex-col bg-background">

      {/* ── Page Header ────────────────────────────────── */}
      <div className="border-b border-border bg-card px-4 sm:px-8 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Percent className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[17px] sm:text-xl font-bold tracking-tight text-foreground">
                  Sale Events
                </h1>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
                  {initialEvents.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                Manage promotional campaigns and discounts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isRefreshing}
              className="h-9 gap-2 rounded-xl text-muted-foreground hover:text-foreground hidden sm:flex shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleRefresh}
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="text-sm">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
            </Button>
            <CreateSaleEventDialog
              businessSlug={businessSlug}
              services={services}
              packages={packages}
              connectedPlatforms={connectedPlatforms}
              socialPublishingEnabled={socialPublishingEnabled}
            />
          </div>
        </div>
      </div>

      {/* ── Main Content ───────────────────────────────── */}
      <div className="px-4 sm:px-8 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto w-full flex flex-col gap-4">

          {growthEnabled ? (
            <GrowthFlowChecklist
              businessSlug={businessSlug}
              flowContext={flowContext}
              activeStep={activeStep}
              completedSteps={[1, ...(hasConfirmedEvent ? ([2] as const) : [])]}
              nextAction={
                hasConfirmedEvent
                  ? socialEnabled
                    ? "Open a social post and review caption, media, and channels."
                    : "Event is ready. Upgrade to Pro to publish directly to social channels."
                  : "Create or generate a draft event from today's opportunity."
              }
              socialEnabled={socialEnabled}
            />
          ) : null}

          {growthEnabled ? (
            <>
              {!growthAiEnabled ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Growth insights are enabled on your plan. AI-generated draft campaigns are available on Pro.
                </div>
              ) : null}

              <GrowthOpportunityPanel
                businessSlug={businessSlug}
                initialOpportunity={initialOpportunity}
                services={services}
                packages={packages}
                flowContext={flowContext}
                growthAiEnabled={growthAiEnabled}
                socialEnabled={socialEnabled}
              />
            </>
          ) : null}

          <SaleEventList
            businessSlug={businessSlug}
            events={initialEvents}
            services={services}
            packages={packages}
            onDelete={handleDelete}
            flowContext={flowContext}
          />
        </div>
      </div>
    </div>
  );
}
