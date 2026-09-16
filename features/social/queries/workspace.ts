import { requireTenantAccess } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";

export async function getSocialPostsWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return null;
  const business = await prisma.business.findUnique({ where: { slug: businessSlug }, select: { id: true, name: true, imageUrl: true, social_posts: { include: { sale_event: { select: { title: true, description: true, discount_type: true, discount_value: true, start_date: true, end_date: true } }, growth_campaigns: { select: { opportunity_snapshot: true }, orderBy: { created_at: "desc" }, take: 1 }, targets: { include: { social_connection: { select: { platform: true, display_name: true } } }, orderBy: { created_at: "asc" } } }, orderBy: { created_at: "desc" } } } });
  if (!business) return null;
  const referenceAssets = await prisma.brandAsset.findMany({ where: { business_id: business.id, kind: "REFERENCE" }, orderBy: { created_at: "desc" }, select: { id: true, url: true, alt: true, reference_subject: true } });
  return { business, referenceAssets };
}
