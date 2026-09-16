import { requireTenantAccess } from "@/lib/auth/guards";
import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export async function getOwnerPreviewBusinessName(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success || auth.session.user.role !== Role.OWNER) return null;
  return prisma.business.findUnique({ where: { slug: businessSlug }, select: { name: true } });
}
