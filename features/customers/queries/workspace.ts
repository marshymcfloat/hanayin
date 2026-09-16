import { requireTenantAccess } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";

export async function getCustomersWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  const business = await prisma.business.findUnique({ where: { slug: businessSlug }, select: { id: true } });
  if (!business) return { success: false as const, error: "Not found" };
  const customers = await prisma.customer.findMany({
    where: { business_id: business.id },
    orderBy: { name: "asc" },
  });
  return { success: true as const, customers };
}
