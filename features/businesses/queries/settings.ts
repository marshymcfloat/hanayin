import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import { isSocialPublishingEnabledForBusiness } from "@/features/social/social-publishing";
import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";

export async function getBusinessSettingsData(businessSlug: string) {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) return null;
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  const business = await prisma.business.findUnique({ where: { slug: businessSlug }, include: { growth_settings: true, social_connections: { orderBy: { platform: "asc" } } } });
  if (!business) return null;
  const brandAssets = await prisma.brandAsset.findMany({ where: { business_id: business.id, kind: { in: ["LOGO", "HERO", "REFERENCE"] } }, orderBy: [{ kind: "asc" }, { created_at: "desc" }], select: { id: true, kind: true, reference_subject: true, url: true, alt: true } });
  return { business, brandAssets, socialEntitled: entitlements.social, socialPublishingEnabled: entitlements.social && isSocialPublishingEnabledForBusiness(businessSlug) };
}
