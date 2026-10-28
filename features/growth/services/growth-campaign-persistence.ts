import "server-only";
import { prisma } from "@/prisma/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { assertGrowthOwner, GrowthActionError, growthOwnerBusinessFilter } from "@/features/growth/growth-action-access";
import { isOwnedGrowthReferenceUrl } from "@/features/growth/services/growth-reference-url";
import type { GrowthCampaignPersistence } from "@/features/growth/growth-action-types";

function toInputJson(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

export async function persistGrowthCampaign(input: GrowthCampaignPersistence) {
  const { actor, opportunity, offer, captions, imagePrompts, schedule, creativeContext, hashtags, mediaUrl, serviceIds, packageIds, connectionIds, finalStartDate, finalEndDate, finalDiscountPercent, finalSlotLimit, reference } = input;
  const isDiscountAction = offer.actionCategory === "DISCOUNT";
  const primaryCaption = captions[0];
  return prisma.$transaction(async tx => {
    await assertGrowthOwner(actor, tx);
    if (opportunity.business_id !== actor.businessId || !await tx.opportunity.findFirst({ where: { id: opportunity.id, business_id: actor.businessId, status: opportunity.status, updated_at: opportunity.updated_at, snapshot_id: opportunity.snapshot_id, snapshot: { business_id: actor.businessId }, business: growthOwnerBusinessFilter(actor) }, select: { id: true } })) throw new GrowthActionError("Opportunity changed. Refresh and try again.");
    const services = [...new Set(serviceIds)]; const packages = [...new Set(packageIds)]; const connections = [...new Set(connectionIds)];
    if (services.length + packages.length === 0 || services.length !== serviceIds.length || packages.length !== packageIds.length || connections.length !== connectionIds.length) throw new GrowthActionError("Campaign references changed. Refresh and try again.");
    if (services.length && await tx.service.count({ where: { id: { in: services }, business_id: actor.businessId } }) !== services.length) throw new GrowthActionError("Campaign references changed. Refresh and try again.");
    if (packages.length && await tx.servicePackage.count({ where: { id: { in: packages }, business_id: actor.businessId } }) !== packages.length) throw new GrowthActionError("Campaign references changed. Refresh and try again.");
    if (connections.length && await tx.socialConnection.count({ where: { id: { in: connections }, business_id: actor.businessId, status: "CONNECTED" } }) !== connections.length) throw new GrowthActionError("Campaign references changed. Refresh and try again.");
    if (reference) {
      if (!isOwnedGrowthReferenceUrl(reference.assetUrl, reference.storageKey, actor.businessSlug) ||
        !await tx.referenceCandidate.findFirst({ where: { id: reference.candidateId, business_id: actor.businessId, status: "APPROVED", approved_asset_id: reference.assetId, updated_at: reference.candidateUpdatedAt }, select: { id: true } }) ||
        !await tx.brandAsset.findFirst({ where: { id: reference.assetId, business_id: actor.businessId, kind: "REFERENCE", url: reference.assetUrl, storage_key: reference.storageKey, updated_at: reference.assetUpdatedAt, AND: [{ OR: [{ service_id: null }, { service: { business_id: actor.businessId } }] }, { OR: [{ employee_id: null }, { employee: { business_id: actor.businessId } }] }] }, select: { id: true } })) throw new GrowthActionError("Campaign reference image changed. Refresh and try again.");
    }

      let saleEventId: number | null = null;

      if (isDiscountAction) {
        const saleEvent = await tx.saleEvent.create({
          data: {
            title: offer.title,
            description: offer.publicDescription,
            start_date: finalStartDate,
            end_date: finalEndDate,
            discount_type: "PERCENTAGE",
            discount_value: finalDiscountPercent,
            slot_limit: finalSlotLimit,
            business_id: actor.businessId,
            applicable_services: {
              connect: serviceIds.map(id => ({ id })),
            },
            applicable_packages: {
              connect: packageIds.map(id => ({ id })),
            },
          },
        });
        saleEventId = saleEvent.id;
      }

      const socialPost = await tx.socialPost.create({
        data: {
          business_id: actor.businessId,
          sale_event_id: saleEventId,
          source: isDiscountAction ? "SALE_EVENT" : "MANUAL",
          status: "DRAFT",
          title: offer.title,
          caption_draft: primaryCaption?.text || offer.title,
          caption_final: null,
          hashtags,
          media_url: mediaUrl,
          created_by_user_id: actor.userId,
        },
      });

      if (connectionIds.length > 0) {
        await tx.socialPostTarget.createMany({
          data: connectionIds.map(id => ({
            social_post_id: socialPost.id,
            social_connection_id: id,
            status: "SKIPPED",
          })),
        });
      }

      const createdCampaign = await tx.campaign.create({
        data: {
          business_id: actor.businessId,
          opportunity_id: opportunity.id,
          status: "DRAFT",
          title: offer.title,
          offer_type: offer.offerType,
          offer_json: toInputJson(offer),
          schedule_json: toInputJson(schedule),
          risk_flags: offer.riskFlags,
          why_this_suggested: opportunity.reason,
          opportunity_snapshot: toInputJson({
            opportunityType: opportunity.type,
            score: opportunity.total_score,
            confidence: opportunity.confidence_score,
            creativeContext,
          }),
          sale_event_id: saleEventId,
          social_post_id: socialPost.id,
          created_by_user_id: actor.userId,
          assets: {
            create: [
              ...captions.map((caption, idx) => ({
                type: "CAPTION" as const,
                variant_label: `${caption.style}:${idx + 1}`,
                content: toInputJson(caption),
              })),
              ...imagePrompts.map((prompt, idx) => ({
                type: "IMAGE_PROMPT" as const,
                variant_label: `${prompt.style}:${idx + 1}`,
                content: toInputJson(prompt),
              })),
              {
                type: "CTA" as const,
                variant_label: "PRIMARY",
                content: toInputJson({
                  keyword: offer.suggestedCtaKeyword,
                  options: primaryCaption?.ctaOptions || [],
                }),
              },
              {
                type: "OVERLAY_TEXT" as const,
                variant_label: "PRIMARY",
                content: toInputJson({
                  value: primaryCaption?.overlaySuggestion || offer.title,
                }),
              },
            ],
          },
        },
      });

      const changed = await tx.opportunity.updateMany({ where: { id: opportunity.id, business_id: actor.businessId, status: opportunity.status, updated_at: opportunity.updated_at, snapshot_id: opportunity.snapshot_id, snapshot: { business_id: actor.businessId }, business: growthOwnerBusinessFilter(actor) }, data: { status: "CONVERTED" } });
      if (changed.count !== 1) throw new GrowthActionError("Opportunity changed. Refresh and try again.");

      return {
        createdCampaign,
        saleEventId,
        socialPostId: socialPost.id,
      };

  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
}
