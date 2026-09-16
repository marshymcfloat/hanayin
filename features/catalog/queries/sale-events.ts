import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import { isSocialPublishingEnabledForBusiness } from "@/features/social/social-publishing";
import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { getTodayOpportunityViews } from "@/lib/services/growth/opportunities";
import { prisma } from "@/prisma/prisma";

export async function getSaleEventsWorkspaceData(businessSlug: string) {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) return auth;
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    include: {
      services: { select: { id: true, name: true, category: true }, orderBy: { name: "asc" } },
      packages: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      sale_events: { include: { applicable_services: true, applicable_packages: true, social_posts: { select: { id: true, status: true } }, _count: { select: { bookings: { where: { status: { not: "CANCELLED" } } } } } }, orderBy: { created_at: "desc" } },
      social_connections: { where: { status: "CONNECTED" }, select: { platform: true } },
    },
  });
  if (!business) return { success: false as const, error: "Not found" };
  const growthOpportunities = entitlements.growth ? await getTodayOpportunityViews(business.id) : [];
  return { success: true as const, business, initialOpportunity: growthOpportunities[0] || null,
    growthEnabled: entitlements.growth, growthAiEnabled: entitlements.ai,
    socialEnabled: entitlements.social && isSocialPublishingEnabledForBusiness(businessSlug) };
}
