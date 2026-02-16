import { getCurrentDateTimePH, getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import { ensureBusinessGrowthSettings, refreshGrowthContextSnapshot } from "@/lib/services/growth/context-snapshot";
import { refreshOpportunitiesForSnapshot } from "@/lib/services/growth/opportunity-detector";
import { prisma } from "@/prisma/prisma";

export async function runGrowthDailyForAllBusinesses() {
  const businesses = await prisma.business.findMany({
    select: { id: true, slug: true, created_at: true },
  });

  const now = getCurrentDateTimePH();
  const start = getStartOfDayPH(now);
  const end = getEndOfDayPH(now);

  let success = 0;
  let failed = 0;
  const details: Array<{ businessSlug: string; error?: string; generated?: number }> = [];

  for (const business of businesses) {
    try {
      const refreshed = await refreshGrowthContextSnapshot(business.slug);
      const settings = await ensureBusinessGrowthSettings(business.id);

      await prisma.opportunity.updateMany({
        where: {
          business_id: business.id,
          status: "OPEN",
          created_at: {
            gte: start,
            lte: end,
          },
        },
        data: {
          status: "DISMISSED",
        },
      });

      const opportunities = await refreshOpportunitiesForSnapshot({
        businessId: business.id,
        snapshotId: refreshed.snapshot.id,
        context: refreshed.contextPayload,
        businessCreatedAt: business.created_at,
        minimumConfidence: settings.min_confidence_threshold,
      });

      success += 1;
      details.push({ businessSlug: business.slug, generated: opportunities.length });
    } catch (error) {
      failed += 1;
      details.push({
        businessSlug: business.slug,
        error: error instanceof Error ? error.message : "Unknown growth daily runner error",
      });
    }
  }

  return {
    businesses: businesses.length,
    success,
    failed,
    details,
  };
}

