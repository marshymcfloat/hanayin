import "server-only";

import { ownerPermissionMembershipWhere } from "@/lib/auth/owner-access";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export async function getPayrollOwnerBusinessId(businessSlug: string, userId: string) {
  const actor = await resolveTenantActorContext(businessSlug, userId);
  if (!actor.success || actor.actorType !== "OWNER") return null;
  const owner = await prisma.owner.findFirst({
    where: ownerPermissionMembershipWhere(actor, OwnerPermission.PAYROLL_MANAGE),
    select: { id: true },
  });
  return owner ? actor.businessId : null;
}
