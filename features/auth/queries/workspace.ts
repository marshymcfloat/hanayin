import { prisma } from "@/prisma/prisma";

export async function getWorkspaceMetadataName(businessSlug: string) {
  const business = await prisma.business.findUnique({ where: { slug: businessSlug }, select: { name: true } });
  return business?.name ?? null;
}
