import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import { requireTenantAccess } from "@/lib/auth/guards";
import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export async function getReportsWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) return { success: false as const, error: "Forbidden" };
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.reportsCore) return { success: false as const, error: "Upgrade required" };
  const business = await prisma.business.findUnique({ where: { slug: businessSlug }, select: { id: true, name: true } });
  return business
    ? { success: true as const, business, actorId: auth.session.user.id, reportsAdvanced: entitlements.reportsAdvanced }
    : { success: false as const, error: "Not found" };
}
