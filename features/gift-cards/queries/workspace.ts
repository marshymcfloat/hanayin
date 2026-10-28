import { getGiftCardsAction } from "@/features/gift-cards/actions/gift-cards";
import { requireTenantAccess } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";
import { giftablePackageWhere } from "@/features/catalog/giftable-packages";

export async function getGiftCardsWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true, initials: true },
  });
  if (!business) return { success: false as const, error: "Not found" };
  const [giftCardsResult, services, packages] = await Promise.all([
    getGiftCardsAction(businessSlug),
    prisma.service.findMany({
      where: { business_id: business.id },
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
    prisma.servicePackage.findMany({
      where: { business_id: business.id, ...giftablePackageWhere },
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    success: true as const,
    giftCards: giftCardsResult.success && giftCardsResult.data ? giftCardsResult.data : [],
    services,
    packages,
    initials: business.initials || "GC",
  };
}
