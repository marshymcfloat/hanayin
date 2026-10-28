import "server-only";
import { prisma } from "@/prisma/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { getCurrentDateTimePH, getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import { refreshGrowthContextSnapshot, ensureBusinessGrowthSettings } from "@/lib/services/growth/context-snapshot";
import { refreshOpportunitiesForSnapshot } from "@/lib/services/growth/opportunity-detector";
import { getTodayOpportunityViews } from "@/lib/services/growth/opportunities";
import type { GrowthContextPayload } from "@/lib/services/growth/types";
import { assertGrowthActor, assertGrowthOwner, GrowthActionError, growthOwnerBusinessFilter } from "@/features/growth/growth-action-access";
import { getGrowthBusinessCreatedAt, getGrowthTodaySnapshot } from "@/features/growth/queries/growth-actions";
import type { GrowthActor, GrowthEventInput, GrowthOwnerActor } from "@/features/growth/growth-action-types";

export async function refreshGrowthSnapshot(actor: GrowthOwnerActor) {
  await assertGrowthOwner(actor);
  const result = await refreshGrowthContextSnapshot(actor.businessSlug);
  return { success: true as const, snapshotId: result.snapshot.id };
}
export async function refreshGrowthOpportunities(actor: GrowthOwnerActor) {
  await assertGrowthOwner(actor);
  const business = await getGrowthBusinessCreatedAt(actor);
  if (!business) return { success: false as const, error: "Business not found." };
  const settings = await ensureBusinessGrowthSettings(actor.businessId);
  const existing = await getGrowthTodaySnapshot(actor);
  let snapshot; let contextPayload: GrowthContextPayload;
  if (existing) {
    if (!existing.context_json || typeof existing.context_json !== "object" || Array.isArray(existing.context_json) || existing.context_json.businessSlug !== actor.businessSlug) throw new GrowthActionError("Invalid context payload");
    snapshot = existing; contextPayload = existing.context_json as unknown as GrowthContextPayload;
  } else {
    await assertGrowthOwner(actor);
    const refreshed = await refreshGrowthContextSnapshot(actor.businessSlug);
    snapshot = refreshed.snapshot; contextPayload = refreshed.contextPayload;
  }
  if (snapshot.business_id !== actor.businessId || contextPayload.businessSlug !== actor.businessSlug) throw new GrowthActionError("Invalid context payload");
  await assertGrowthOwner(actor);
  const now = getCurrentDateTimePH();
  await prisma.opportunity.updateMany({ where: { business_id: actor.businessId, business: growthOwnerBusinessFilter(actor), status: "OPEN", created_at: { gte: getStartOfDayPH(now), lte: getEndOfDayPH(now) } }, data: { status: "DISMISSED" } });
  // Legacy detector owns its writes; the complete refresh is not one transaction.
  const generated = await refreshOpportunitiesForSnapshot({ businessId: actor.businessId, snapshotId: snapshot.id, context: contextPayload, businessCreatedAt: business.created_at, minimumConfidence: settings.min_confidence_threshold });
  return { success: true as const, generated: generated.length, topIds: generated.map(item => item.id) };
}
export async function getTodayGrowthOpportunities(actor: GrowthActor) {
  await assertGrowthActor(actor);
  return { success: true as const, data: await getTodayOpportunityViews(actor.businessId) };
}
export async function recordGrowthCampaignEvent(actor: GrowthOwnerActor, input: GrowthEventInput) {
  return prisma.$transaction(async tx => {
    await assertGrowthOwner(actor, tx);
    const campaign = await tx.campaign.findFirst({ where: { id: input.campaignId, business_id: actor.businessId, business: growthOwnerBusinessFilter(actor), opportunity: { business_id: actor.businessId }, OR: [{ sale_event_id: null }, { sale_event: { business_id: actor.businessId } }], AND: [{ OR: [{ social_post_id: null }, { social_post: { business_id: actor.businessId } }] }] }, select: { id: true } });
    if (!campaign) return { success: false as const, error: "Campaign not found." };
    await tx.campaignEvent.create({ data: { campaign_id: campaign.id, event_type: input.eventType, value: input.value ?? null, metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue : undefined } });
    return { success: true as const };
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
}
