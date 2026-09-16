"use client";

import { useRef, useState } from "react";
import { CreateSaleEventDialog } from "./CreateSaleEventDialog";
import { SaleEventList, type SaleEvent } from "./SaleEventList";
import { deleteSaleEvent } from "@/features/catalog/actions/sale-event";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Megaphone, Percent, RefreshCcw, Sparkles } from "lucide-react";
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
    <main className="min-h-full bg-muted/20">

      {/* ── Page Header ────────────────────────────────── */}
      <header className="border-b border-border bg-background px-4 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/10">
              <Percent className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  Sale Events
                </h1>
                <span className="shrink-0 rounded-lg bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground tabular-nums">
                  {initialEvents.length} {initialEvents.length === 1 ? "event" : "events"}
                </span>
              </div>
              <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
                Plan offers, create campaign drafts, and track what is live.
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
      </header>

      {/* ── Main Content ───────────────────────────────── */}
      <div className="px-4 py-5 sm:px-8 sm:py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">

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

              <section aria-labelledby="campaign-workspace-title" className="overflow-hidden rounded-[28px] border border-border bg-background shadow-sm shadow-foreground/[0.03]">
                <div className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-5" /></span>
                  <div>
                    <h2 id="campaign-workspace-title" className="font-semibold text-foreground">Campaign workspace</h2>
                    <p className="text-sm text-muted-foreground">Turn today&apos;s strongest opportunity into a ready-to-review campaign.</p>
                  </div>
                </div>
                <div className="p-3 sm:p-4">
                  <GrowthOpportunityPanel
                    businessSlug={businessSlug}
                    initialOpportunity={initialOpportunity}
                    services={services}
                    packages={packages}
                    flowContext={flowContext}
                    growthAiEnabled={growthAiEnabled}
                    socialEnabled={socialEnabled}
                  />
                </div>
              </section>
            </>
          ) : null}

          <section aria-labelledby="events-title" className="space-y-3">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <h2 id="events-title" className="flex items-center gap-2 text-base font-semibold text-foreground"><Megaphone className="size-4 text-primary" />Your campaigns</h2>
                <p className="mt-1 text-sm text-muted-foreground">Active, scheduled, and past sale events.</p>
              </div>
            </div>
            <SaleEventList
              businessSlug={businessSlug}
              events={initialEvents}
              services={services}
              packages={packages}
              onDelete={handleDelete}
              flowContext={flowContext}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
