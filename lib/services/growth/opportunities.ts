import { getCurrentDateTimePH, getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import { recommendPostingSchedule } from "@/lib/services/growth/schedule-recommender";
import type { OpportunityView } from "@/lib/services/growth/types";
import { prisma } from "@/prisma/prisma";

function toObjectRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function getTodayOpportunityViews(businessId: string): Promise<OpportunityView[]> {
  const now = getCurrentDateTimePH();
  const start = getStartOfDayPH(now);
  const end = getEndOfDayPH(now);

  const [opportunities, activeCampaigns] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        business_id: businessId,
        status: "OPEN",
        created_at: {
          gte: start,
          lte: end,
        },
      },
      orderBy: [{ total_score: "desc" }, { created_at: "desc" }],
      take: 5,
    }),
    prisma.campaign.findMany({
      where: {
        business_id: businessId,
        sale_event: {
          start_date: { lte: now },
          end_date: { gte: now },
        },
      },
      select: {
        opportunity: {
          select: {
            type: true,
          },
        },
      },
    }),
  ]);

  const activeOpportunityTypes = new Set(
    activeCampaigns.map((campaign) => campaign.opportunity.type),
  );
  const unsuppressedOpportunities = opportunities
    .filter((opportunity) => !activeOpportunityTypes.has(opportunity.type))
    .slice(0, 3);

  return unsuppressedOpportunities.map((opportunity) => {
    const schedule = recommendPostingSchedule({
      opportunityType: opportunity.type,
      opportunityWindowStart: opportunity.time_window_start,
      opportunityWindowEnd: opportunity.time_window_end,
      now,
    });

    return {
      id: opportunity.id,
      type: opportunity.type,
      reason: opportunity.reason,
      urgency: opportunity.urgency_score,
      confidence: opportunity.confidence_score,
      score: opportunity.total_score,
      timeWindowStart: opportunity.time_window_start.toISOString(),
      timeWindowEnd: opportunity.time_window_end.toISOString(),
      recommendedOfferTypes: opportunity.recommended_offer_types,
      metadata: toObjectRecord(opportunity.metadata),
      suggestedPostTimes: schedule.map((entry) => entry.timestamp.toISOString()),
    };
  });
}
