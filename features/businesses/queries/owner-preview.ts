import "server-only";

import { requireTenantAccess } from "@/lib/auth/guards";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export async function getVerifiedOwnerPreviewBusinessName(
  context: OwnerActorContext,
  db: Pick<Prisma.TransactionClient, "business"> = prisma,
) {
  return db.business.findFirst({
    where: {
      id: context.businessId,
      slug: context.businessSlug,
      owners: {
        some: {
          id: context.ownerId,
          user_id: context.userId,
          business_id: context.businessId,
          user: { role: Role.OWNER },
        },
      },
    },
    select: { name: true },
  });
}

export async function getOwnerPreviewBusinessName(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success || auth.session.user.role !== Role.OWNER) return null;
  return prisma.business.findUnique({ where: { slug: businessSlug }, select: { name: true } });
}
