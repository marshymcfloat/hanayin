import { requireTenantAccess } from "@/lib/auth/guards";
import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export async function getOwnersWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) {
    return { success: false as const, error: "Forbidden" };
  }
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true },
  });
  if (!business) return { success: false as const, error: "Not found" };
  const [owners, serviceCategories] = await Promise.all([
    prisma.owner.findMany({
      where: { business_id: business.id },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.service.findMany({
      where: { business_id: business.id },
      select: { category: true },
      distinct: ["category"],
    }),
  ]);
  const categories = serviceCategories.map(({ category }) => category)
    .filter((category) => category.toLowerCase() !== "general")
    .sort((a, b) => a.localeCompare(b));
  return { success: true as const, owners, categories };
}
