import "server-only";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { ensureBusinessGrowthSettings } from "@/lib/services/growth/context-snapshot";
import { generateOfferFromOpportunity } from "@/lib/services/growth/offer-generator";
import { generateCaptionVariants } from "@/lib/services/growth/caption-generator";
import { generateImagePromptVariants } from "@/lib/services/growth/image-prompt-generator";
import { recommendPostingSchedule } from "@/lib/services/growth/schedule-recommender";
import { generateAndUploadPromoImage } from "@/lib/services/social/promo-image";
import type { GeneratedCampaignView } from "@/lib/services/growth/types";
import { pickCampaignStyling } from "@/lib/services/growth/styling-recommender";
import { startGrowthCampaignTimer } from "@/lib/telemetry/growth-events";
import type { SocialImageProfile } from "@/lib/services/social/image-profiles";
import { buildCampaignCreativeContext } from "@/lib/services/growth/creative-context";
import { assertGrowthOwner, GrowthActionError } from "@/features/growth/growth-action-access";
import { getGrowthCampaignBusiness, getGrowthCampaignOpportunity } from "@/features/growth/queries/growth-actions";
import { getGrowthApprovedReference } from "@/features/growth/services/growth-reference";
import { persistGrowthCampaign } from "@/features/growth/services/growth-campaign-persistence";
import type { GrowthCampaignInput, GrowthOwnerActor } from "@/features/growth/growth-action-types";

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


export async function generateGrowthCampaign(actor: GrowthOwnerActor, input: GrowthCampaignInput): Promise<{ success: boolean; data?: GeneratedCampaignView; error?: string }> {
  try {
    await assertGrowthOwner(actor);
    const business = await getGrowthCampaignBusiness(actor);

    if (!business) {
      return { success: false, error: "Business not found." };
    }

    const [settings, opportunity] = await Promise.all([
      ensureBusinessGrowthSettings(business.id),
      getGrowthCampaignOpportunity(actor, input.opportunityId),
    ]);
    if (!opportunity) {
      return { success: false, error: "Opportunity not found." };
    }

    if (input.selectedServiceIds.some(id => !business.services.some(service => service.id === id)) || input.selectedPackageIds.some(id => !business.packages.some(pkg => pkg.id === id))) return { success: false, error: "Selected services or packages are unavailable." };

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

    // Wave I4: offer-side smart-default. By the time we run, we know the
    // concrete offer type (FLASH_DEAL, BUNDLE, …) which is a sharper signal
    // than the opportunity type the dialog used for its pre-pick. The
    // picker also handles topic-keyword refinement (medical procedures,
    // transformations) and respects owner overrides from the dialog.
    const styling = pickCampaignStyling({
      offer: {
        offerType: offer.offerType,
        publicDescription: offer.publicDescription,
      },
      override: {
        captionTone: input.styling?.captionTone ?? null,
        imageProfile: input.styling?.imageProfile ?? null,
      },
    });
    const captionTone = styling.captionTone;
    const imageProfileSelection: SocialImageProfile = styling.imageProfile;
    const ownerCaptionDirection = input.styling?.ownerCaptionDirection?.trim();
    const ownerImageDirection = input.styling?.ownerImageDirection?.trim();
    const serviceNames = serviceCandidates.map((service) => service.name);
    const serviceCategories = Array.from(new Set(serviceCandidates.map((service) => service.category)));
    const packageNames = packageCandidates.map((pkg) => pkg.name);
    const creativeContext = buildCampaignCreativeContext({
      opportunity: { type: opportunity.type, reason: opportunity.reason, metadata: opportunity.metadata },
      offer,
      serviceNames,
      serviceCategories,
      packageNames,
      imageProfile: imageProfileSelection,
      captionTone,
      ownerCaptionDirection,
      ownerImageDirection,
    });

    let finishTelemetry: ReturnType<typeof startGrowthCampaignTimer> | null = null;
    try {
      finishTelemetry = startGrowthCampaignTimer({ action: "GENERATED", businessId: actor.businessId, actorRole: actor.actorType, offerType: offer.offerType, inferredCaptionTone: styling.inferredCaptionTone, inferredImageProfile: styling.inferredImageProfile });
    } catch { /* Observability cannot block the creative pipeline. */ }

    const captions = await generateCaptionVariants({
      businessSlug: business.slug,
      businessName: business.name,
      businessType: settings.business_type,
      opportunityReason: opportunity.reason,
      offer,
      toneProfile: settings.tone_profile,
      serviceNames,
      serviceCategories,
      packageNames,
      captionTone,
      ownerCaptionDirection,
      creativeContext,
    });

    const imagePrompts = await generateImagePromptVariants({
      businessName: business.name,
      businessType: settings.business_type,
      offer,
      captionHooks: captions.map(
        (entry) => entry.text.split("\n")[0] || entry.text,
      ),
      skipLlm: true,
      creativeContext,
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

    const resolvedReference = await getGrowthApprovedReference(actor, serviceCategories);
    const approvedReference = resolvedReference?.image ?? null;

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
        imageProfile: imageProfileSelection,
        ownerImageDirection,
        creativeContext,
        creativeBrief: imagePrompts[0]?.prompt || creativeContext.visualBrief,
        reference: approvedReference,
      });
    } catch (error) {
      void error;
      mediaUrl = null;
    }

    const campaign = await persistGrowthCampaign({ actor, opportunity, offer, captions, imagePrompts, schedule, creativeContext, hashtags, mediaUrl, serviceIds: serviceCandidates.map(service => service.id), packageIds: packageCandidates.map(pkg => pkg.id), connectionIds: business.social_connections.map(connection => connection.id), finalStartDate, finalEndDate, finalDiscountPercent, finalSlotLimit, reference: resolvedReference?.source ?? null });

    try { finishTelemetry?.({
      success: true,
      actualCaptionTone: captionTone,
      actualImageProfile: imageProfileSelection,
      ownerOverrodeCaptionTone: styling.ownerOverrodeCaptionTone,
      ownerOverrodeImageProfile: styling.ownerOverrodeImageProfile,
      aiInvoked: true,
    }); } catch { /* A committed campaign remains successful. */ }
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
    // Telemetry skipped on the error path — required variables (styling,
    // captionTone, imageProfileSelection) are scoped to the try block and
    // most error paths happen before they're assigned. Auth/prisma errors
    // are already observable through their own pipelines.
    return {
      success: false,
      error: error instanceof GrowthActionError ? error.message : "Failed to generate campaign.",
    };
  }
}

