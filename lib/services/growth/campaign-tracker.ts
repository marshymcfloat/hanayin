import { prisma } from "@/prisma/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function trackCampaignEvent(input: {
  campaignId: string;
  eventType:
    | "POST_PUBLISHED"
    | "CLICK_RECORDED"
    | "DM_INQUIRY"
    | "BOOKING_ATTRIBUTED"
    | "PROMO_REDEEMED"
    | "MANUAL_FEEDBACK";
  value?: number;
  metadata?: Record<string, unknown>;
}) {
  return prisma.campaignEvent.create({
    data: {
      campaign_id: input.campaignId,
      event_type: input.eventType,
      value: input.value ?? null,
      metadata: input.metadata ? toInputJson(input.metadata) : undefined,
    },
  });
}

export async function getCampaignPerformanceSummary(input: {
  businessId: string;
  horizonDays: number;
}) {
  const horizonDate = new Date(Date.now() - input.horizonDays * 24 * 60 * 60 * 1000);
  const campaigns = await prisma.campaign.findMany({
    where: {
      business_id: input.businessId,
      created_at: {
        gte: horizonDate,
      },
    },
    include: {
      opportunity: {
        select: { type: true },
      },
      events: {
        select: {
          event_type: true,
          value: true,
          occurred_at: true,
        },
      },
      assets: {
        where: { type: "CAPTION" },
        select: {
          variant_label: true,
        },
      },
    },
  });

  const totalsByOpportunity = new Map<string, number>();
  const totalsByCaptionStyle = new Map<string, number>();
  const totalsByOfferType = new Map<string, number>();

  for (const campaign of campaigns) {
    let score = 0;
    for (const event of campaign.events) {
      if (event.event_type === "BOOKING_ATTRIBUTED") score += event.value ?? 1;
      if (event.event_type === "PROMO_REDEEMED") score += (event.value ?? 1) * 2;
      if (event.event_type === "DM_INQUIRY") score += event.value ?? 1;
      if (event.event_type === "CLICK_RECORDED") score += (event.value ?? 1) * 0.2;
      if (event.event_type === "POST_PUBLISHED") score += 0.5;
    }

    totalsByOpportunity.set(
      campaign.opportunity.type,
      (totalsByOpportunity.get(campaign.opportunity.type) || 0) + score,
    );
    totalsByOfferType.set(
      campaign.offer_type,
      (totalsByOfferType.get(campaign.offer_type) || 0) + score,
    );
    for (const asset of campaign.assets) {
      totalsByCaptionStyle.set(
        asset.variant_label,
        (totalsByCaptionStyle.get(asset.variant_label) || 0) + score,
      );
    }
  }

  return {
    campaignsConsidered: campaigns.length,
    totalsByOpportunity: Object.fromEntries(totalsByOpportunity.entries()),
    totalsByCaptionStyle: Object.fromEntries(totalsByCaptionStyle.entries()),
    totalsByOfferType: Object.fromEntries(totalsByOfferType.entries()),
  };
}
