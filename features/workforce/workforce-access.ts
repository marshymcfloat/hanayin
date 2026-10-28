import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

export async function currentWorkforceOwner(businessSlug: string, userId: string, db: Pick<Prisma.TransactionClient, "owner"> = prisma) {
  return db.owner.findFirst({ where: { user_id: userId, user: { role: "OWNER" }, business: { slug: businessSlug }, permissions: { has: "WORKFORCE_MANAGE" } }, select: { id: true, business_id: true } });
}
