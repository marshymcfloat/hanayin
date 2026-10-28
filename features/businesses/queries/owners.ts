import { requireTenantAccess } from "@/lib/auth/guards";
import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { publicUserSelect, toPublicUser } from "@/lib/auth/public-user";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";

export async function getOwnersWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) {
    return { success: false as const, error: "Forbidden" };
  }
  const actor = await resolveTenantActorContext(businessSlug, auth.session.user.id);
  if (!actor.success || actor.actorType !== "OWNER") {
    return { success: false as const, error: "Forbidden" };
  }
  const [owners, serviceCategories] = await Promise.all([
    prisma.owner.findMany({
      where: { business_id: actor.businessId },
      include: { user: { select: publicUserSelect } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.service.findMany({
      where: { business_id: actor.businessId },
      select: { category: true },
      distinct: ["category"],
    }),
  ]);
  const categories = serviceCategories.map(({ category }) => category)
    .filter((category) => category.toLowerCase() !== "general")
    .sort((a, b) => a.localeCompare(b));
  return { success: true as const, owners: owners.map((owner) => ({ ...owner, user: toPublicUser(owner.user) })), categories };
}
