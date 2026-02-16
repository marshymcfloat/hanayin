"use client";

import { CreateSaleEventDialog } from "./CreateSaleEventDialog";
import { SaleEventList, type SaleEvent } from "./SaleEventList";
import { deleteSaleEvent } from "@/lib/server actions/sale-event";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Percent } from "lucide-react";
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
  const hasConfirmedEvent =
    initialEvents.length > 0 || typeof flowContext?.saleEventId === "number";
  const activeStep = flowContext?.step ?? (hasConfirmedEvent ? 2 : 1);

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
    <div className="space-y-6">
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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <Percent className="h-6 w-6 text-emerald-700" />
            </div>
            Sale Events
          </h2>
          <p className="text-zinc-500 mt-1">
            Manage your promotional campaigns and discounts.
          </p>
        </div>
        <CreateSaleEventDialog
          businessSlug={businessSlug}
          services={services}
          packages={packages}
          connectedPlatforms={connectedPlatforms}
          socialPublishingEnabled={socialPublishingEnabled}
        />
      </div>

      {growthEnabled ? (
        <>
          {!growthAiEnabled ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Growth insights are enabled on your plan. AI-generated draft campaigns are available
              on Pro.
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
  );
}
