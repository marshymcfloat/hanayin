import { SaleEventsPageClient } from "@/components/dashboard/owner/sale-events/SaleEventsPageClient";
import { redirect } from "next/navigation";
import { getSaleEventsWorkspaceData } from "@/features/catalog/queries/sale-events";
import { parseGrowthFlowContext } from "@/components/dashboard/owner/growth/types";

export default async function SaleEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const data = await getSaleEventsWorkspaceData(businessSlug);
  if (!data.success) {
    redirect(`/app/${businessSlug}`);
  }
  const flowContext = parseGrowthFlowContext(rawSearchParams);

  const { business, initialOpportunity, growthEnabled, growthAiEnabled, socialEnabled } = data;

  return (
    <SaleEventsPageClient
      businessSlug={businessSlug}
      initialEvents={business.sale_events}
      services={business.services}
      packages={business.packages}
      initialOpportunity={initialOpportunity}
      connectedPlatforms={business.social_connections.map(
        (connection) => connection.platform,
      )}
      socialPublishingEnabled={socialEnabled}
      growthEnabled={growthEnabled}
      growthAiEnabled={growthAiEnabled}
      socialEnabled={socialEnabled}
      flowContext={flowContext}
    />
  );
}
