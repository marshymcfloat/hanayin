import { resolveEntitlements } from "@/features/billing/plan-entitlements";
import { prisma } from "@/prisma/prisma";

export type PublicBusinessSitemapEntry = {
  slug: string;
  updatedAt: Date;
  hasServices: boolean;
};

export async function listPublicBusinessSitemapEntries(): Promise<
  PublicBusinessSitemapEntry[]
> {
  const businesses = await prisma.business.findMany({
    where: {
      subscriptions: {
        some: {
          status: { in: ["TRIALING", "ACTIVE", "GRACE_PERIOD"] },
        },
      },
    },
    select: {
      slug: true,
      updated_at: true,
      subscriptions: {
        take: 1,
        orderBy: { created_at: "desc" },
        select: {
          plan: {
            select: {
              code: true,
            },
          },
        },
      },
      _count: {
        select: {
          services: true,
        },
      },
    },
    orderBy: {
      updated_at: "desc",
    },
  });

  return businesses.flatMap((business) => {
    const planCode = business.subscriptions[0]?.plan.code;
    if (!resolveEntitlements(planCode).website) return [];

    return [
      {
        slug: business.slug,
        updatedAt: business.updated_at,
        hasServices: business._count.services > 0,
      },
    ];
  });
}
