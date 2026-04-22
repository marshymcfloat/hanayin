"use server";

import { revalidatePath } from "next/cache";

import { getCurrentDateTimePH, getEndOfDayPH, getStartOfDayPH } from "@/lib/date-utils";
import { requireOwnerTenantWriteAccess, requireTenantAccess } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { refreshGrowthContextSnapshot, ensureBusinessGrowthSettings } from "@/lib/services/growth/context-snapshot";
import { refreshOpportunitiesForSnapshot } from "@/lib/services/growth/opportunity-detector";
import { getTodayOpportunityViews } from "@/lib/services/growth/opportunities";
import { generateOfferFromOpportunity } from "@/lib/services/growth/offer-generator";
import { generateCaptionVariants } from "@/lib/services/growth/caption-generator";
import { generateImagePromptVariants } from "@/lib/services/growth/image-prompt-generator";
import { recommendPostingSchedule } from "@/lib/services/growth/schedule-recommender";
import { trackCampaignEvent } from "@/lib/services/growth/campaign-tracker";
import { generateAndUploadPromoImage } from "@/lib/services/social/promo-image";
import type { GeneratedCampaignView, GrowthContextPayload } from "@/lib/services/growth/types";
import {
  generateGrowthCampaignSchema,
  trackGrowthCampaignEventSchema,
} from "@/lib/zod-schemas/growth";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";

function normalizeHashtags(hashtags: string[]) {
  return Array.from(
    new Set(
      hashtags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)),
    ),
  );
}

async function ensureGrowthAccess(businessSlug: string) {
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.growth) {
    return {
      success: false as const,
      error: "Growth opportunities are available on Plus and Pro plans.",
    };
  }

  return null;
}

function toContextPayload(value: unknown): GrowthContextPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid context payload");
  }
  return value as GrowthContextPayload;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseManilaDateTime(value: string): Date | null {
  if (!value) return null;
  const withTz =
    value.includes("+") || value.endsWith("Z")
      ? value
      : value + "+08:00";
  const date = new Date(withTz);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildDraftSaleWindow(input: {
  offerWindowStart: Date;
  offerWindowEnd: Date;
  schedule: Array<{ timestamp: Date }>;
}) {
  const now = getCurrentDateTimePH();
  const minStart = new Date(now.getTime() + 30 * 60 * 1000);
  const nextScheduleSlot = input.schedule.find(
    (slot) => slot.timestamp.getTime() > minStart.getTime(),
  )?.timestamp;
  const fallbackStart = nextScheduleSlot || minStart;
  const startDate =
    input.offerWindowStart.getTime() > minStart.getTime()
      ? input.offerWindowStart
      : fallbackStart;

  const minEnd = new Date(startDate.getTime() + 60 * 60 * 1000);
  const fallbackEnd = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
  const endFromOffer =
    input.offerWindowEnd.getTime() > minEnd.getTime()
      ? input.offerWindowEnd
      : fallbackEnd;
  const endDate = endFromOffer.getTime() > minEnd.getTime() ? endFromOffer : minEnd;

  return { startDate, endDate };
}

async function getOrRefreshTodaySnapshot(businessSlug: string, businessId: string) {
  const now = getCurrentDateTimePH();
  const start = getStartOfDayPH(now);
  const end = getEndOfDayPH(now);

  const existing = await prisma.growthContextSnapshot.findFirst({
    where: {
      business_id: businessId,
      snapshot_date: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { created_at: "desc" },
  });

  if (existing) {
    return {
      snapshot: existing,
      contextPayload: toContextPayload(existing.context_json),
    };
  }

  const refreshed = await refreshGrowthContextSnapshot(businessSlug);
  return {
    snapshot: refreshed.snapshot,
    contextPayload: refreshed.contextPayload,
  };
}

export async function refreshGrowthContextAction(businessSlug: string) {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) return auth;
  const growthError = await ensureGrowthAccess(businessSlug);
  if (growthError) return growthError;

  try {
    const result = await refreshGrowthContextSnapshot(businessSlug);
    revalidatePath(`/app/${businessSlug}`);
    return {
      success: true as const,
      snapshotId: result.snapshot.id,
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to refresh growth context.",
    };
  }
}

export async function refreshGrowthOpportunitiesAction(businessSlug: string) {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) return auth;
  const growthError = await ensureGrowthAccess(businessSlug);
  if (growthError) return growthError;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
      select: { id: true, created_at: true },
    });
    if (!business) {
      return { success: false as const, error: "Business not found." };
    }

    const settings = await ensureBusinessGrowthSettings(business.id);
    const { snapshot, contextPayload } = await getOrRefreshTodaySnapshot(
      businessSlug,
      business.id,
    );

    const now = getCurrentDateTimePH();
    const start = getStartOfDayPH(now);
    const end = getEndOfDayPH(now);
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

    const generated = await refreshOpportunitiesForSnapshot({
      businessId: business.id,
      snapshotId: snapshot.id,
      context: contextPayload,
      businessCreatedAt: business.created_at,
      minimumConfidence: settings.min_confidence_threshold,
    });

    revalidatePath(`/app/${businessSlug}`);
    return {
      success: true as const,
      generated: generated.length,
      topIds: generated.map((item) => item.id),
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to refresh opportunities.",
    };
  }
}

export async function getTodayGrowthOpportunitiesAction(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  const growthError = await ensureGrowthAccess(businessSlug);
  if (growthError) return growthError;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
      select: { id: true },
    });
    if (!business) {
      return { success: false as const, error: "Business not found." };
    }

    const data = await getTodayOpportunityViews(business.id);
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to load opportunities.",
    };
  }
}

export async function generateGrowthCampaignAction(
  rawInput: unknown,
): Promise<{ success: boolean; data?: GeneratedCampaignView; error?: string }> {
  const parsed = generateGrowthCampaignSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid campaign generation input.",
    };
  }

  const input = parsed.data;
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;
  const entitlements = await getBusinessEntitlementsBySlug(input.businessSlug);
  if (!entitlements.growth) {
    return {
      success: false,
      error: "Growth opportunities are available on Plus and Pro plans.",
    };
  }
  if (!entitlements.ai) {
    return {
      success: false,
      error: "AI growth campaign generation is available on Pro.",
    };
  }

  try {
    const business = await prisma.business.findUnique({
      where: { slug: input.businessSlug },
      include: {
        services: {
          select: {
            id: true,
            name: true,
            price: true,
            duration: true,
            category: true,
          },
          orderBy: { price: "asc" },
        },
        packages: {
          select: {
            id: true,
            name: true,
          },
          orderBy: { id: "asc" },
        },
        social_connections: {
          where: { status: "CONNECTED" },
          select: { id: true },
        },
      },
    });

    if (!business) {
      return { success: false, error: "Business not found." };
    }

    const [settings, opportunity] = await Promise.all([
      ensureBusinessGrowthSettings(business.id),
      prisma.opportunity.findFirst({
        where: {
          id: input.opportunityId,
          business_id: business.id,
        },
      }),
    ]);
    if (!opportunity) {
      return { success: false, error: "Opportunity not found." };
    }

    const hasExplicitScopeSelection =
      input.selectedServiceIds.length > 0 || input.selectedPackageIds.length > 0;
    const serviceCandidates = hasExplicitScopeSelection
      ? business.services.filter((service) => input.selectedServiceIds.includes(service.id))
      : business.services.slice(0, 3);
    const packageCandidates = hasExplicitScopeSelection
      ? business.packages.filter((pkg) => input.selectedPackageIds.includes(pkg.id))
      : [];

    if (serviceCandidates.length === 0 && packageCandidates.length === 0) {
      return {
        success: false,
        error: "Select at least one service or package to generate a campaign.",
      };
    }

    const offer = generateOfferFromOpportunity({
      opportunity,
      business: {
        name: business.name,
        type: settings.business_type,
        maxDiscountPercent: settings.max_discount_percent,
        enableStudentPromo: settings.enable_student_promo,
        avoidCheapWording: settings.avoid_cheap_wording,
      },
      services: serviceCandidates,
      constraints: input.constraints,
    });

    const captions = await generateCaptionVariants({
      businessSlug: business.slug,
      businessName: business.name,
      businessType: settings.business_type,
      opportunityReason: offer.publicDescription,
      offer,
      toneProfile: settings.tone_profile,
      serviceNames: serviceCandidates.map((service) => service.name),
      serviceCategories: Array.from(
        new Set(serviceCandidates.map((service) => service.category)),
      ),
      packageNames: packageCandidates.map((pkg) => pkg.name),
    });

    const imagePrompts = await generateImagePromptVariants({
      businessName: business.name,
      businessType: settings.business_type,
      offer,
      captionHooks: captions.map(
        (entry) => entry.text.split("\n")[0] || entry.text,
      ),
      skipLlm: true,
    });

    const schedule = recommendPostingSchedule({
      opportunityType: opportunity.type,
      opportunityWindowStart: opportunity.time_window_start,
      opportunityWindowEnd: opportunity.time_window_end,
    });

    const primaryCaption = captions[0];
    const hashtags = normalizeHashtags(primaryCaption?.hashtags || []);
    const draftWindow = buildDraftSaleWindow({
      offerWindowStart: offer.timeWindowStart,
      offerWindowEnd: offer.timeWindowEnd,
      schedule,
    });
    const serviceNames = serviceCandidates.map((service) => service.name);
    const serviceCategories = Array.from(
      new Set(serviceCandidates.map((service) => service.category)),
    );
    const packageNames = packageCandidates.map((pkg) => pkg.name);

    const finalDiscountPercent =
      offer.actionCategory === "DISCOUNT" && input.overrides?.discountPercent != null
        ? input.overrides.discountPercent
        : (offer.mechanics.discountPercent ?? 0);
    const finalStartDate =
      input.overrides?.startDate
        ? (parseManilaDateTime(input.overrides.startDate) ?? draftWindow.startDate)
        : draftWindow.startDate;
    const finalEndDate =
      input.overrides?.endDate
        ? (parseManilaDateTime(input.overrides.endDate) ?? draftWindow.endDate)
        : draftWindow.endDate;
    const finalSlotLimit =
      input.overrides?.slotLimit != null
        ? input.overrides.slotLimit
        : (offer.mechanics.limitedSlots ?? null);

    let mediaUrl: string | null = null;
    try {
      mediaUrl = await generateAndUploadPromoImage({
        businessSlug: business.slug,
        businessName: business.name,
        title: offer.title,
        saleDescription: offer.publicDescription,
        captionText: primaryCaption?.text || offer.title,
        discountType: "PERCENTAGE",
        discountValue: offer.actionCategory === "DISCOUNT" ? finalDiscountPercent : 0,
        startDate: finalStartDate,
        endDate: finalEndDate,
        serviceNames,
        serviceCategories,
        packageNames,
        actionCategory: offer.actionCategory,
      });
    } catch (error) {
      console.warn("Failed to auto-generate growth campaign social image:", error);
      mediaUrl = null;
    }

    const isDiscountAction = offer.actionCategory === "DISCOUNT";

    const campaign = await prisma.$transaction(async (tx) => {
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
            business_id: business.id,
            applicable_services: {
              connect: serviceCandidates.map((service) => ({ id: service.id })),
            },
            applicable_packages: {
              connect: packageCandidates.map((pkg) => ({ id: pkg.id })),
            },
          },
        });
        saleEventId = saleEvent.id;
      }

      const socialPost = await tx.socialPost.create({
        data: {
          business_id: business.id,
          sale_event_id: saleEventId,
          source: isDiscountAction ? "SALE_EVENT" : "MANUAL",
          status: "DRAFT",
          title: offer.title,
          caption_draft: primaryCaption?.text || offer.title,
          caption_final: null,
          hashtags,
          media_url: mediaUrl,
          created_by_user_id: auth.session.user.id,
        },
      });

      if (business.social_connections.length > 0) {
        await tx.socialPostTarget.createMany({
          data: business.social_connections.map((connection) => ({
            social_post_id: socialPost.id,
            social_connection_id: connection.id,
            status: "SKIPPED",
          })),
        });
      }

      const createdCampaign = await tx.campaign.create({
        data: {
          business_id: business.id,
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
          }),
          sale_event_id: saleEventId,
          social_post_id: socialPost.id,
          created_by_user_id: auth.session.user.id,
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

      await tx.opportunity.update({
        where: { id: opportunity.id },
        data: {
          status: "CONVERTED",
        },
      });

      return {
        createdCampaign,
        saleEventId,
        socialPostId: socialPost.id,
      };
    });

    revalidatePath(`/app/${input.businessSlug}`);
    revalidatePath(`/app/${input.businessSlug}/sale-events`);
    revalidatePath(`/app/${input.businessSlug}/social-posts`);

    return {
      success: true,
      data: {
        campaignId: campaign.createdCampaign.id,
        opportunityId: opportunity.id,
        offer,
        captions,
        imagePrompts,
        schedule,
        saleEventId: campaign.saleEventId,
        socialPostId: campaign.socialPostId,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate campaign.",
    };
  }
}

export async function trackGrowthCampaignEventAction(rawInput: unknown) {
  const parsed = trackGrowthCampaignEventSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false as const,
      error: "Invalid campaign event payload.",
    };
  }

  const input = parsed.data;
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;
  const growthError = await ensureGrowthAccess(input.businessSlug);
  if (growthError) return growthError;

  try {
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: input.campaignId,
        business: {
          slug: input.businessSlug,
        },
      },
      select: { id: true },
    });
    if (!campaign) {
      return { success: false as const, error: "Campaign not found." };
    }

    await trackCampaignEvent({
      campaignId: campaign.id,
      eventType: input.eventType,
      value: input.value,
      metadata: input.metadata,
    });

    revalidatePath(`/app/${input.businessSlug}`);
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to track campaign event.",
    };
  }
}
