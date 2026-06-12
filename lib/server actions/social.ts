"use server";

import { revalidatePath } from "next/cache";

import { isSocialPublishingEnabledForBusiness } from "@/lib/features/social-publishing";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";
import {
  requireOwnerTenantWriteAccess,
  requireTenantAccess,
} from "@/lib/auth/guards";
import { generateSocialCaptionDraft, generateOrganicCaptionDraft, type OrganicPostCategory } from "@/lib/services/social/caption-generator";
import { generateAndUploadOrganicImage, type OrganicImageInput } from "@/lib/services/social/promo-image";
import { generateAndUploadPromoImage, type ReferenceImage } from "@/lib/services/social/promo-image";
import { fetchReferenceImageBytes } from "@/lib/services/social/reference-image";
import { isGeminiConfigured } from "@/lib/services/social/gemini-client";
import { publishEvent, publishEvents } from "@/lib/services/outbox";
import { prisma } from "@/prisma/prisma";
import { DiscountType } from "@/prisma/generated/prisma/enums";
import {
  DEFAULT_SOCIAL_IMAGE_PROFILE,
  isSocialImageProfile,
  type SocialImageProfile,
} from "@/lib/services/social/image-profiles";
import { inferCreativeBrief } from "@/lib/services/social/creative-brief";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { startOrganicPostTimer } from "@/lib/telemetry/social-organic-events";

function normalizeHashtags(hashtags: string[]) {
  return Array.from(
    new Set(
      hashtags
        .map((hashtag) => hashtag.trim())
        .filter(Boolean)
        .map((hashtag) => (hashtag.startsWith("#") ? hashtag : `#${hashtag}`)),
    ),
  );
}

async function ensureSocialPublishingAccess(businessSlug: string) {
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.social) {
    return {
      success: false as const,
      error: "Social publishing is available on the Pro plan.",
    };
  }

  if (!isSocialPublishingEnabledForBusiness(businessSlug)) {
    return {
      success: false as const,
      error:
        "Social publishing is not enabled for this business yet. Contact support to join the pilot.",
    };
  }

  return null;
}

async function ensureAiAccess(businessSlug: string) {
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.ai) {
    return {
      success: false as const,
      error: "AI social generation is available on the Pro plan.",
    };
  }

  return null;
}

export async function getSocialConnectionsAction(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(businessSlug);
  if (featureError) return featureError;

  try {
    const connections = await prisma.socialConnection.findMany({
      where: { business: { slug: businessSlug } },
      orderBy: [{ platform: "asc" }],
    });

    return { success: true as const, data: connections };
  } catch (error) {
    console.error("Error fetching social connections:", error);
    return {
      success: false as const,
      error: "Failed to load social connections.",
    };
  }
}

export async function disconnectSocialConnectionAction(params: {
  businessSlug: string;
  connectionId: string;
}) {
  const auth = await requireOwnerTenantWriteAccess(params.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(params.businessSlug);
  if (featureError) return featureError;

  try {
    const result = await prisma.socialConnection.updateMany({
      where: {
        id: params.connectionId,
        business: { slug: params.businessSlug },
      },
      data: {
        status: "REVOKED",
      },
    });

    if (result.count === 0) {
      return { success: false as const, error: "Social connection not found." };
    }

    await prisma.auditLog.create({
      data: {
        entity_type: "SocialConnection",
        entity_id: params.connectionId,
        action: "DISCONNECTED",
        actor_id: auth.session.user.id,
        actor_type: "USER",
        business_id: auth.businessSlug,
      },
    });

    revalidatePath(`/app/${params.businessSlug}/business`);
    revalidatePath(`/app/${params.businessSlug}/sale-events`);
    revalidatePath(`/app/${params.businessSlug}/social-posts`);
    return { success: true as const };
  } catch (error) {
    console.error("Error disconnecting social connection:", error);
    return {
      success: false as const,
      error: "Failed to disconnect social connection.",
    };
  }
}

export async function generateSocialCaptionAction(input: {
  businessSlug: string;
  saleTitle: string;
  saleDescription?: string;
  discountType: DiscountType;
  discountValue: number;
  startDate: Date | string;
  endDate: Date | string;
  serviceNames?: string[];
  serviceCategories?: string[];
  packageNames?: string[];
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;
  const aiError = await ensureAiAccess(input.businessSlug);
  if (aiError) return aiError;

  try {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { success: false as const, error: "Invalid event date range." };
    }

    const business = await prisma.business.findUnique({
      where: { slug: input.businessSlug },
      select: { name: true, description: true },
    });

    if (!business) {
      return { success: false as const, error: "Business not found." };
    }

    const generated = await generateSocialCaptionDraft({
      businessSlug: input.businessSlug,
      businessName: business.name,
      businessDescription: business.description,
      saleTitle: input.saleTitle,
      saleDescription: input.saleDescription,
      discountType: input.discountType,
      discountValue: input.discountValue,
      startDate,
      endDate,
      serviceNames: input.serviceNames ?? [],
      serviceCategories: input.serviceCategories ?? [],
      packageNames: input.packageNames ?? [],
    });

    return {
      success: true as const,
      data: generated,
    };
  } catch (error) {
    console.error("Error generating social caption:", error);
    return {
      success: false as const,
      error: "Unable to generate social caption.",
    };
  }
}

export async function createOrganicSocialPostAction(input: {
  businessSlug: string;
  topic: string;
  category: OrganicPostCategory;
  serviceNames?: string[];
  visualMood?: string;
  visualFocus?: string;
  imageProfile?: string;
  generateImageNow?: boolean;
  ownerDirection?: string;
  /**
   * Caption-tone control. Same enum as the campaign side. Lets owners pick
   * a voice register for ad-hoc organic posts (premium / playful / urgent
   * etc.) instead of always taking the engine's default.
   */
  captionTone?:
    | "AUTO"
    | "FRIENDLY_TAGLISH"
    | "PREMIUM_LUXURY"
    | "WITTY_PLAYFUL"
    | "WARM_NURTURING"
    | "DIRECT_URGENT";
  /**
   * Caption-only owner direction. Distinct from ownerDirection (which is
   * shared with the image prompt) so owners can shape the caption voice
   * without affecting the visual direction.
   */
  ownerCaptionDirection?: string;
  /**
   * Wave E E2: when this action is called from
   * approveSocialPostRequestAction, the resulting SocialPost is linked
   * back to the originating SocialPostRequest via social_post_id (one-
   * to-one). The request also flips to APPROVED in the same
   * transaction. When unset, this is the legacy direct-owner flow and
   * no link is created.
   */
  sourceRequestId?: string;
}) {
  // When called from the request-approval flow, the SOCIAL_POST_REVIEW
  // permission was already enforced upstream by
  // approveSocialPostRequestAction. We relax the owner-only check to a
  // tenant-write check so reviewers (managers with the flag) can drive
  // approvals. Direct owner usage retains the strict owner gate.
  const auth = input.sourceRequestId
    ? await requireTenantAccess(input.businessSlug, { write: true })
    : await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;

  // Wave J4 — telemetry. Compute the inferred brief up front (pure) so we
  // can compare it against what the owner actually sent, and resolve the
  // actor context so the event carries businessId + role. If actor
  // resolution fails for any reason, telemetry skips silently — never
  // breaks the action.
  const trimmedTopic = input.topic.trim();
  const inferredBrief = inferCreativeBrief({
    category: input.category,
    topic: trimmedTopic,
  });
  const actor = await resolveTenantActorContext(
    input.businessSlug,
    auth.session.user.id,
  ).catch(() => null);
  const finishTelemetry = actor && actor.success
    ? startOrganicPostTimer({
        action: "CREATED",
        businessId: actor.businessId,
        actorRole: actor.actorType,
        category: input.category,
        inferredImageProfile: inferredBrief.imageProfile,
        inferredCaptionTone: inferredBrief.captionTone,
      })
    : null;

  // Resolve "actual" caption tone using the same rule the dialog uses:
  // "AUTO" / undefined / null all mean "fall back to the inferred tone".
  const actualCaptionTone =
    input.captionTone && input.captionTone !== "AUTO"
      ? input.captionTone
      : inferredBrief.captionTone;
  const ownerOverrodeCaptionTone =
    !!input.captionTone && input.captionTone !== "AUTO";
  const ownerOverrodeMood =
    !!input.visualMood &&
    input.visualMood.trim().length > 0 &&
    input.visualMood !== inferredBrief.mood;
  const ownerOverrodeFocus =
    !!input.visualFocus &&
    input.visualFocus.trim().length > 0 &&
    input.visualFocus !== inferredBrief.visualFocus;
  const validImageProfileOverride =
    input.imageProfile && isSocialImageProfile(input.imageProfile)
      ? (input.imageProfile as SocialImageProfile)
      : null;
  const ownerOverrodeImageProfile =
    !!validImageProfileOverride &&
    validImageProfileOverride !== inferredBrief.imageProfile;
  const actualImageProfile: SocialImageProfile =
    validImageProfileOverride ?? inferredBrief.imageProfile;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: input.businessSlug },
      select: { id: true, name: true, description: true },
    });

    if (!business) {
      finishTelemetry?.({
        success: false,
        errorCode: "BUSINESS_NOT_FOUND",
        actualImageProfile,
        actualCaptionTone,
        ownerOverrodeMood,
        ownerOverrodeFocus,
        ownerOverrodeImageProfile,
        ownerOverrodeCaptionTone,
        educationalOverlayApplied: false,
        aiInvoked: false,
      });
      return { success: false as const, error: "Business not found." };
    }

    const aiError = await ensureAiAccess(input.businessSlug);
    const aiInvoked = !aiError;
    let captionDraft = "";
    let hashtags: string[] = [];
    let mediaUrl: string | null = null;

    if (!aiError) {
      try {
        const generated = await generateOrganicCaptionDraft({
          businessSlug: input.businessSlug,
          businessName: business.name,
          businessDescription: business.description,
          topic: input.topic,
          category: input.category,
          serviceNames: input.serviceNames ?? [],
          mood: input.visualMood,
          visualFocus: input.visualFocus,
          ownerContext: input.ownerDirection,
          captionTone: input.captionTone,
          ownerCaptionDirection: input.ownerCaptionDirection,
        });
        captionDraft = generated.caption;
        hashtags = generated.hashtags;
      } catch {
        // fallback to empty draft
      }

      if (input.generateImageNow) {
        try {
          const organicImageInput: OrganicImageInput = {
            businessSlug: input.businessSlug,
            businessName: business.name,
            topic: input.topic,
            category: input.category,
            captionText: captionDraft || null,
            imageProfile: validImageProfileOverride ?? actualImageProfile,
            visualMood: input.visualMood,
            visualFocus: input.visualFocus,
            ownerDirection: input.ownerDirection,
            imprintBusinessName: true,
          };
          mediaUrl = await generateAndUploadOrganicImage(organicImageInput);
        } catch {
          // image generation is best-effort
        }
      }
    }

    // Wave H6: the educational overlay is composed only when an image was
    // actually uploaded AND the actual profile is EDUCATIONAL AND we had a
    // non-empty topic to use as the headline. Mirror that logic here so
    // the telemetry flag accurately reports whether the overlay actually
    // got applied (vs. quietly skipped because of a missing topic).
    const educationalOverlayApplied =
      !!mediaUrl &&
      actualImageProfile === "EDUCATIONAL" &&
      trimmedTopic.length > 0;

    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.socialPost.create({
        data: {
          business_id: business.id,
          source: "MANUAL",
          // Wave L1: persist category so regenerate-caption + future
          // category-aware features have a stable source of truth.
          category: input.category,
          title: input.topic.trim(),
          caption_draft: captionDraft,
          hashtags,
          media_url: mediaUrl,
          status: captionDraft ? "READY" : "DRAFT",
          created_by_user_id: auth.session.user.id,
        },
      });

      // Wave E E2: when the action was invoked from the request-approval
      // flow, link the new SocialPost back to its SocialPostRequest and
      // flip the request status to APPROVED in the same transaction.
      // The link is one-to-one (social_post_id is @unique on the
      // request) so a second approve attempt for the same request would
      // fail at the DB level — that's a race, not a bug.
      if (input.sourceRequestId) {
        await tx.socialPostRequest.update({
          where: {
            id: input.sourceRequestId,
            business_id: business.id,
          },
          data: {
            status: "APPROVED",
            social_post_id: created.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          entity_type: "SocialPost",
          entity_id: created.id,
          action: "ORGANIC_POST_CREATED",
          actor_id: auth.session.user.id,
          actor_type: "USER",
          business_id: business.id,
          changes: {
            topic: input.topic,
            category: input.category,
            visualMood: input.visualMood ?? null,
            visualFocus: input.visualFocus ?? null,
            generatedImage: !!mediaUrl,
            sourceRequestId: input.sourceRequestId ?? null,
          },
        },
      });

      return created;
    });

    revalidatePath(`/app/${input.businessSlug}/social-posts`);
    finishTelemetry?.({
      success: true,
      actualImageProfile,
      actualCaptionTone,
      ownerOverrodeMood,
      ownerOverrodeFocus,
      ownerOverrodeImageProfile,
      ownerOverrodeCaptionTone,
      educationalOverlayApplied,
      aiInvoked,
    });
    return { success: true as const, data: { postId: post.id } };
  } catch (error) {
    console.error("Error creating organic social post:", error);
    finishTelemetry?.({
      success: false,
      errorCode: "UNKNOWN",
      actualImageProfile,
      actualCaptionTone,
      ownerOverrodeMood,
      ownerOverrodeFocus,
      ownerOverrodeImageProfile,
      ownerOverrodeCaptionTone,
      educationalOverlayApplied: false,
      aiInvoked: false,
    });
    return { success: false as const, error: "Failed to create post." };
  }
}

export async function generateOrganicCaptionAction(input: {
  businessSlug: string;
  topic: string;
  category: OrganicPostCategory;
  serviceNames?: string[];
  visualMood?: string;
  visualFocus?: string;
  ownerContext?: string;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;
  const aiError = await ensureAiAccess(input.businessSlug);
  if (aiError) return aiError;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: input.businessSlug },
      select: { name: true, description: true },
    });

    if (!business) {
      return { success: false as const, error: "Business not found." };
    }

    const generated = await generateOrganicCaptionDraft({
      businessSlug: input.businessSlug,
      businessName: business.name,
      businessDescription: business.description,
      topic: input.topic,
      category: input.category,
      serviceNames: input.serviceNames ?? [],
      mood: input.visualMood,
      visualFocus: input.visualFocus,
      ownerContext: input.ownerContext,
    });

    return { success: true as const, data: generated };
  } catch (error) {
    console.error("Error generating organic caption:", error);
    return { success: false as const, error: "Unable to generate caption." };
  }
}

export async function updateSocialPostDraftAction(input: {
  businessSlug: string;
  postId: string;
  title: string;
  captionFinal: string;
  hashtags: string[];
  mediaUrl?: string | null;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;

  try {
    const post = await prisma.socialPost.findFirst({
      where: {
        id: input.postId,
        business: { slug: input.businessSlug },
      },
      select: { id: true },
    });

    if (!post) {
      return { success: false as const, error: "Social post draft not found." };
    }

    const captionFinal = input.captionFinal.trim();
    const status = captionFinal ? "READY" : "DRAFT";
    const hashtags = normalizeHashtags(input.hashtags);

    await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        title: input.title.trim(),
        caption_final: captionFinal || null,
        hashtags,
        media_url: input.mediaUrl?.trim() || null,
        status,
        last_error: null,
      },
    });

    revalidatePath(`/app/${input.businessSlug}/social-posts`);
    revalidatePath(`/app/${input.businessSlug}/sale-events`);
    return { success: true as const };
  } catch (error) {
    console.error("Error updating social post draft:", error);
    return { success: false as const, error: "Failed to update social draft." };
  }
}

export async function deleteSocialPostDraftAction(input: {
  businessSlug: string;
  postId: string;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;

  try {
    const post = await prisma.socialPost.findFirst({
      where: {
        id: input.postId,
        business: { slug: input.businessSlug },
      },
      select: {
        id: true,
        title: true,
        status: true,
        business_id: true,
      },
    });

    if (!post) {
      return { success: false as const, error: "Social post draft not found." };
    }

    // Posts that have been (or are being) pushed to a social platform
    // shouldn't be deleted from this UI — the live post would still be on
    // Facebook/Instagram and the audit trail would mislead the owner.
    if (post.status === "PUBLISHED" || post.status === "PUBLISHING") {
      return {
        success: false as const,
        error: "Published posts can't be deleted from here.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.socialPost.delete({
        where: { id: post.id },
      });

      await tx.auditLog.create({
        data: {
          entity_type: "SocialPost",
          entity_id: post.id,
          action: "DRAFT_DELETED",
          actor_id: auth.session.user.id,
          actor_type: "USER",
          business_id: post.business_id,
          changes: {
            title: post.title,
            status: post.status,
          },
        },
      });
    });

    revalidatePath(`/app/${input.businessSlug}/social-posts`);
    revalidatePath(`/app/${input.businessSlug}/sale-events`);
    return { success: true as const };
  } catch (error) {
    console.error("Error deleting social post draft:", error);
    return { success: false as const, error: "Failed to delete social draft." };
  }
}

export async function generateSocialPostImageAction(input: {
  businessSlug: string;
  postId: string;
  imageProfile?: SocialImageProfile;
  /**
   * Optional reusable reference image from the brand-asset library
   * (kind=REFERENCE). When set, generation is conditioned on the image —
   * a PERSON reference triggers strict identity-preservation prompting.
   */
  referenceAssetId?: string;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;
  const aiError = await ensureAiAccess(input.businessSlug);
  if (aiError) return aiError;

  try {
    // Resolve the optional reference image up front. The owner explicitly
    // picked it, so a missing/unfetchable asset is a hard error — we never
    // silently fall back to a generic generation.
    let reference: ReferenceImage | null = null;
    let referenceWarning: string | null = null;
    if (input.referenceAssetId) {
      const refAsset = await prisma.brandAsset.findFirst({
        where: {
          id: input.referenceAssetId,
          business: { slug: input.businessSlug },
          kind: "REFERENCE",
        },
        select: { url: true, reference_subject: true },
      });
      if (!refAsset) {
        return {
          success: false as const,
          error: "Reference image not found or was removed. Pick another.",
        };
      }
      const fetched = await fetchReferenceImageBytes(refAsset.url);
      if (!fetched.ok) {
        return {
          success: false as const,
          error: "Could not load the selected reference image. Try again.",
        };
      }
      reference = {
        data: fetched.data,
        mimeType: fetched.mimeType,
        subject: refAsset.reference_subject ?? "STYLE",
      };
      // Identity preservation depends on a multimodal model. The OpenAI
      // edits fallback works but is weaker at faces, so flag it.
      if (reference.subject === "PERSON" && !isGeminiConfigured()) {
        referenceWarning =
          "For best identity preservation, configure GEMINI_KEY — the fallback model may not reproduce a face exactly.";
      }
    }

    const post = await prisma.socialPost.findFirst({
      where: {
        id: input.postId,
        business: { slug: input.businessSlug },
      },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        sale_event: {
          select: {
            title: true,
            description: true,
            discount_type: true,
            discount_value: true,
            start_date: true,
            end_date: true,
            applicable_services: { select: { name: true, category: true } },
            applicable_packages: { select: { name: true } },
          },
        },
      },
    });

    if (!post) {
      return { success: false as const, error: "Social post draft not found." };
    }

    const imageProfile = input.imageProfile || DEFAULT_SOCIAL_IMAGE_PROFILE;
    if (!isSocialImageProfile(imageProfile)) {
      return { success: false as const, error: "Invalid image profile selected." };
    }

    let mediaUrl: string | null | undefined;

    if (!post.sale_event) {
      // Organic post — pure photography with a small brand-name watermark.
      mediaUrl = await generateAndUploadOrganicImage({
        businessSlug: post.business.slug,
        businessName: post.business.name,
        topic: post.title,
        category: "GENERAL",
        captionText: post.caption_final || post.caption_draft,
        imageProfile,
        imprintBusinessName: true,
        reference,
      });
    } else {
      const today = new Date();
      mediaUrl = await generateAndUploadPromoImage({
        businessSlug: post.business.slug,
        businessName: post.business.name,
        title: post.sale_event.title,
        saleDescription: post.sale_event.description,
        captionText: post.caption_final || post.caption_draft,
        discountType: post.sale_event.discount_type,
        discountValue: post.sale_event.discount_value,
        startDate: post.sale_event.start_date ?? today,
        endDate: post.sale_event.end_date ?? today,
        serviceNames: post.sale_event.applicable_services.map((service) => service.name),
        serviceCategories: Array.from(
          new Set(post.sale_event.applicable_services.map((service) => service.category)),
        ),
        packageNames: post.sale_event.applicable_packages.map((pkg) => pkg.name),
        imageProfile,
        reference,
      });
    }

    if (!mediaUrl) {
      return {
        success: false as const,
        error:
          "Image generation is unavailable right now. Configure BLOB_READ_WRITE_TOKEN and GEMINI_KEY, then try again.",
      };
    }

    await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        media_url: mediaUrl,
        last_error: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        entity_type: "SocialPost",
        entity_id: post.id,
        action: "IMAGE_GENERATED",
        actor_id: auth.session.user.id,
        actor_type: "USER",
        business_id: post.business.id,
        changes: {
          mediaUrl,
          imageProfile,
          referenceAssetId: input.referenceAssetId ?? null,
          referenceSubject: reference?.subject ?? null,
        },
      },
    });

    revalidatePath(`/app/${input.businessSlug}/social-posts`);
    revalidatePath(`/app/${input.businessSlug}/sale-events`);
    return {
      success: true as const,
      data: { mediaUrl, warning: referenceWarning },
    };
  } catch (error) {
    console.error("Error generating social post image:", error);
    return {
      success: false as const,
      error: "Failed to generate social image.",
    };
  }
}

export async function regenerateSocialPostCaptionAction(input: {
  businessSlug: string;
  postId: string;
  /**
   * Optional owner-selected tone override. When omitted (or "AUTO"), the
   * generator picks the tone implied by the offer/category. Lets the owner
   * regenerate the same post in a different voice without leaving the
   * post-edit dialog.
   */
  captionTone?:
    | "AUTO"
    | "FRIENDLY_TAGLISH"
    | "PREMIUM_LUXURY"
    | "WITTY_PLAYFUL"
    | "WARM_NURTURING"
    | "DIRECT_URGENT";
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;
  const aiError = await ensureAiAccess(input.businessSlug);
  if (aiError) return aiError;

  try {
    const post = await prisma.socialPost.findFirst({
      where: {
        id: input.postId,
        business: { slug: input.businessSlug },
      },
      include: {
        business: {
          select: {
            name: true,
            slug: true,
            description: true,
          },
        },
        // Wave L1: include source_request so the regenerate path can
        // recover category for posts that came through the approval
        // workflow even when the SocialPost's own column is null
        // (rows created before the L1 migration ran).
        source_request: {
          select: {
            category: true,
          },
        },
        sale_event: {
          select: {
            title: true,
            description: true,
            discount_type: true,
            discount_value: true,
            start_date: true,
            end_date: true,
            applicable_services: { select: { name: true, category: true } },
            applicable_packages: { select: { name: true } },
          },
        },
      },
    });

    if (!post) {
      return { success: false as const, error: "Social post draft not found." };
    }

    const toneOverride =
      input.captionTone && input.captionTone !== "AUTO"
        ? input.captionTone
        : undefined;

    let generated;
    if (post.sale_event) {
      generated = await generateSocialCaptionDraft({
        businessSlug: post.business.slug,
        businessName: post.business.name,
        businessDescription: post.business.description,
        saleTitle: post.sale_event.title,
        saleDescription: post.sale_event.description,
        discountType: post.sale_event.discount_type,
        discountValue: post.sale_event.discount_value,
        startDate: post.sale_event.start_date,
        endDate: post.sale_event.end_date,
        serviceNames: post.sale_event.applicable_services.map((service) => service.name),
        serviceCategories: Array.from(
          new Set(post.sale_event.applicable_services.map((service) => service.category)),
        ),
        packageNames: post.sale_event.applicable_packages.map((pkg) => pkg.name),
        captionTone: toneOverride,
      });
    } else {
      // Wave L1: prefer the post's own category, fall back to the
      // source request when the post came through the approval flow,
      // and only as a last resort default to GENERAL. This was the
      // user-reported bug where TIPS_EDUCATION posts regenerated as
      // generic "small note for the community" copy.
      const resolvedCategory = (post.category ??
        post.source_request?.category ??
        "GENERAL") as OrganicPostCategory;
      generated = await generateOrganicCaptionDraft({
        businessSlug: post.business.slug,
        businessName: post.business.name,
        businessDescription: post.business.description,
        topic: post.title,
        category: resolvedCategory,
        captionTone: toneOverride,
      });
    }

    return {
      success: true as const,
      data: generated,
    };
  } catch (error) {
    console.error("Error regenerating social caption:", error);
    return {
      success: false as const,
      error: "Unable to regenerate social caption.",
    };
  }
}

export async function publishSocialPostAction(input: {
  businessSlug: string;
  postId: string;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;

  try {
    await prisma.$transaction(async (tx) => {
      const post = await tx.socialPost.findFirst({
        where: {
          id: input.postId,
          business: { slug: input.businessSlug },
        },
        include: {
          business: { select: { id: true } },
          targets: {
            include: {
              social_connection: {
                select: { platform: true },
              },
            },
          },
        },
      });

      if (!post) {
        throw new Error("Social post not found.");
      }

      if (post.status === "PUBLISHED") {
        return;
      }

      if (post.status === "PUBLISHING") {
        throw new Error("This post is already being published.");
      }

      if (post.targets.length === 0) {
        throw new Error(
          "No connected channels on this draft. Connect Facebook/Instagram or choose channels first.",
        );
      }

      const targetsToQueue = post.targets.filter(
        (target) => target.status !== "PUBLISHED",
      );
      if (targetsToQueue.length === 0) {
        throw new Error("All channels for this post are already published.");
      }

      const hasInstagramTarget = targetsToQueue.some(
        (target) =>
          target.social_connection.platform === "INSTAGRAM_BUSINESS",
      );
      if (hasInstagramTarget && !post.media_url) {
        throw new Error(
          "Instagram publishing requires media. Add a media URL before publishing.",
        );
      }

      await tx.socialPost.update({
        where: { id: post.id },
        data: {
          status: "PUBLISHING",
          publish_requested_at: new Date(),
          last_error: null,
        },
      });

      await tx.socialPostTarget.updateMany({
        where: {
          social_post_id: post.id,
          id: { in: targetsToQueue.map((target) => target.id) },
        },
        data: {
          status: "QUEUED",
          last_error: null,
        },
      });

      await publishEvents(
        tx,
        targetsToQueue.map((target) => ({
          type: "SOCIAL_TARGET_PUBLISH" as const,
          aggregateType: "SocialPost",
          aggregateId: post.id,
          businessId: post.business_id,
          payload: {
            socialPostTargetId: target.id,
            businessId: post.business_id,
          },
        })),
      );

      await tx.auditLog.create({
        data: {
          entity_type: "SocialPost",
          entity_id: post.id,
          action: "PUBLISH_REQUESTED",
          actor_id: auth.session.user.id,
          actor_type: "USER",
          business_id: post.business_id,
          changes: {
            targetsQueued: targetsToQueue.length,
          },
        },
      });
    });

    revalidatePath(`/app/${input.businessSlug}/social-posts`);
    revalidatePath(`/app/${input.businessSlug}/sale-events`);
    return { success: true as const };
  } catch (error) {
    console.error("Error publishing social post:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to publish post.",
    };
  }
}

export async function retrySocialPostTargetAction(input: {
  businessSlug: string;
  targetId: string;
}) {
  const auth = await requireOwnerTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  const featureError = await ensureSocialPublishingAccess(input.businessSlug);
  if (featureError) return featureError;

  try {
    await prisma.$transaction(async (tx) => {
      const target = await tx.socialPostTarget.findFirst({
        where: {
          id: input.targetId,
          social_post: {
            business: { slug: input.businessSlug },
          },
        },
        include: {
          social_post: true,
        },
      });

      if (!target) {
        throw new Error("Target channel not found.");
      }

      if (target.status === "PUBLISHED") {
        return;
      }

      await tx.socialPost.update({
        where: { id: target.social_post_id },
        data: {
          status: "PUBLISHING",
          publish_requested_at: new Date(),
          last_error: null,
        },
      });

      await tx.socialPostTarget.update({
        where: { id: target.id },
        data: {
          status: "QUEUED",
          last_error: null,
        },
      });

      await publishEvent(tx, {
        type: "SOCIAL_TARGET_PUBLISH",
        aggregateType: "SocialPost",
        aggregateId: target.social_post_id,
        businessId: target.social_post.business_id,
        payload: {
          socialPostTargetId: target.id,
          businessId: target.social_post.business_id,
        },
      });

      await tx.auditLog.create({
        data: {
          entity_type: "SocialPostTarget",
          entity_id: target.id,
          action: "RETRY_REQUESTED",
          actor_id: auth.session.user.id,
          actor_type: "USER",
          business_id: target.social_post.business_id,
        },
      });
    });

    revalidatePath(`/app/${input.businessSlug}/social-posts`);
    return { success: true as const };
  } catch (error) {
    console.error("Error retrying social post target:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to retry target.",
    };
  }
}
