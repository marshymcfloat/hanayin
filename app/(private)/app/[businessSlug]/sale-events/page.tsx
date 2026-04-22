import { prisma } from "@/prisma/prisma";
import { SaleEventsPageClient } from "@/components/dashboard/owner/sale-events/SaleEventsPageClient";
import { redirect } from "next/navigation";
import { isSocialPublishingEnabledForBusiness } from "@/lib/features/social-publishing";
import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { getTodayOpportunityViews } from "@/lib/services/growth/opportunities";
import { parseGrowthFlowContext } from "@/components/dashboard/owner/growth/types";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";

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
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) {
    redirect(`/app/${businessSlug}`);
  }
  const flowContext = parseGrowthFlowContext(rawSearchParams);

  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  const growthEnabled = entitlements.growth;
  const growthAiEnabled = entitlements.ai;
  const socialEnabled =
    entitlements.social && isSocialPublishingEnabledForBusiness(businessSlug);

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    include: {
      services: {
        select: { id: true, name: true, category: true },
        orderBy: { name: "asc" },
      },
      packages: {
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
      sale_events: {
        include: {
          applicable_services: true,
          applicable_packages: true,
          social_posts: {
            select: {
              id: true,
              status: true,
            },
          },
          _count: {
            select: {
              bookings: { where: { status: { not: "CANCELLED" } } },
            },
          },
        },
        orderBy: { created_at: "desc" },
      },
      social_connections: {
        where: { status: "CONNECTED" },
        select: { platform: true },
      },
    },
  });

  if (!business) {
    redirect("/app");
  }

  const growthOpportunities = growthEnabled
    ? await getTodayOpportunityViews(business.id)
    : [];

  return (
    <SaleEventsPageClient
      businessSlug={businessSlug}
      initialEvents={business.sale_events}
      services={business.services}
      packages={business.packages}
      initialOpportunity={growthOpportunities[0] || null}
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
