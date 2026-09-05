import { prisma } from "@/prisma/prisma";
import type { JWT } from "next-auth/jwt";

export async function isSessionUserValid(token: JWT): Promise<boolean> {
  if (!token.id) return false;

  const user = await prisma.user.findUnique({
    where: { id: token.id },
    select: {
      role: true,
      owner: { select: { business: { select: { slug: true } } } },
      employee: { select: { business: { select: { slug: true } } } },
    },
  });

  if (!user || user.role !== token.role) return false;
  if (user.role === "PLATFORM_ADMIN") return true;

  const business = user.role === "OWNER"
    ? user.owner?.business
    : user.employee?.business;
  return !!business && business.slug === token.businessSlug;
}
