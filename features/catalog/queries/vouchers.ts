import { getVouchersAction } from "@/features/catalog/actions/vouchers";
import { requireTenantAccess } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";

export async function getVouchersWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  const [vouchersResult, business] = await Promise.all([
    getVouchersAction(businessSlug),
    prisma.business.findUnique({ where: { slug: businessSlug }, select: { initials: true } }),
  ]);
  return {
    success: true as const,
    vouchers: vouchersResult.success && vouchersResult.data ? vouchersResult.data : [],
    initials: business?.initials || "VO",
  };
}
