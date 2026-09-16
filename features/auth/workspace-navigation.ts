import { prisma } from "@/prisma/prisma";

/** Resolves legacy sessions that predate the businessSlug session claim. */
export async function getWorkspaceSlugForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      employee: { select: { business: { select: { slug: true } } } },
      owner: { select: { business: { select: { slug: true } } } },
    },
  });

  return user?.employee?.business.slug ?? user?.owner?.business.slug ?? null;
}
