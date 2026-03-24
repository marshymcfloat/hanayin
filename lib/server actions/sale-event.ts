"use server";

import {
  DiscountType,
  SocialPlatform,
} from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireOwnerTenantWriteAccess, requireTenantAccess } from "@/lib/auth/guards";
import { isSocialPublishingEnabledForBusiness } from "@/lib/features/social-publishing";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";
import { generateSocialCaptionDraft } from "@/lib/services/social/caption-generator";
import { generateAndUploadPromoImage } from "@/lib/services/social/promo-image";
import { type SocialImageProfile } from "@/lib/services/social/image-profiles";
import { tenantCacheTags } from "@/lib/data/cached";

export type CreateSaleEventParams = {
  businessSlug: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  discountType: DiscountType;
  discountValue: number;
  serviceIds: number[];
  packageIds: number[];
  createSocialDraft?: boolean;
  targetPlatforms?: SocialPlatform[];
  socialCaptionOverride?: string;
  socialMediaUrl?: string;
  socialImageProfile?: SocialImageProfile;
  slotLimit?: number | null;
};

export type UpdateSaleEventParams = {
  id: number;
  businessSlug: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  discountType: DiscountType;
  discountValue: number;
  serviceIds: number[];
  packageIds: number[];
};

export async function getSaleEvents(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;

  try {
    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
    });

    if (!business) {
      throw new Error("Business not found");
    }

    const saleEvents = await prisma.saleEvent.findMany({
      where: { business_id: business.id },
      include: {
        applicable_services: true,
        applicable_packages: true,
      },
      orderBy: { created_at: "desc" },
    });

    return { success: true, data: saleEvents };
  } catch (error) {
    console.error("Error fetching sale events:", error);
    return { success: false, error: "Failed to fetch sale events" };
  }
}

export async function createSaleEvent(params: CreateSaleEventParams) {
  const auth = await requireOwnerTenantWriteAccess(params.businessSlug);
  if (!auth.success) return auth;

  try {
    const serviceIds = Array.from(new Set(params.serviceIds));
    const packageIds = Array.from(new Set(params.packageIds));

    if (serviceIds.length === 0 && packageIds.length === 0) {
      return {
        success: false,
        error: "Select at least one service or package for this sale event.",
      };
    }

    const business = await prisma.business.findUnique({
      where: { slug: params.businessSlug },
      include: {
        services: {
          where: { id: { in: serviceIds } },
          select: { name: true, category: true },
        },
        packages: {
          where: { id: { in: packageIds } },
          select: { name: true },
        },
      },
    });

    if (!business) {
      throw new Error("Business not found");
    }

    if (business.services.length !== serviceIds.length) {
      return {
        success: false,
        error: "One or more selected services are invalid for this business.",
      };
    }

    if (business.packages.length !== packageIds.length) {
      return {
        success: false,
        error: "One or more selected packages are invalid for this business.",
      };
    }

    const shouldCreateSocialDraft = !!params.createSocialDraft;
    const targetPlatforms =
      params.targetPlatforms && params.targetPlatforms.length > 0
        ? Array.from(new Set(params.targetPlatforms))
        : [];

    let connectedTargets: { id: string; platform: SocialPlatform }[] = [];
    let draftCaption = "";
    let draftHashtags: string[] = [];
    let mediaUrl: string | null = params.socialMediaUrl || null;
    let captionFinal: string | null = null;

    if (shouldCreateSocialDraft) {
      const entitlements = await getBusinessEntitlementsBySlug(params.businessSlug);
      if (!entitlements.social) {
        return {
          success: false,
          error: "Social publishing is available on the Pro plan.",
        };
      }

      if (!isSocialPublishingEnabledForBusiness(params.businessSlug)) {
        return {
          success: false,
          error:
            "Social publishing is not enabled for this business yet. Contact support to join the pilot.",
        };
      }

      if (targetPlatforms.length === 0) {
        return {
          success: false,
          error: "Please select at least one connected platform.",
        };
      }

      connectedTargets = await prisma.socialConnection.findMany({
        where: {
          business_id: business.id,
          status: "CONNECTED",
          platform: { in: targetPlatforms },
        },
        select: { id: true, platform: true },
      });

      if (connectedTargets.length === 0) {
        return {
          success: false,
          error:
            "No connected social channels were found. Connect Facebook or Instagram first.",
        };
      }

      const generated = await generateSocialCaptionDraft({
        businessSlug: params.businessSlug,
        businessName: business.name,
        businessDescription: business.description,
        saleTitle: params.title,
        saleDescription: params.description,
        discountType: params.discountType,
        discountValue: params.discountValue,
        startDate: params.startDate,
        endDate: params.endDate,
        serviceNames: business.services.map((service) => service.name),
        serviceCategories: Array.from(
          new Set(business.services.map((service) => service.category)),
        ),
        packageNames: business.packages.map((pkg) => pkg.name),
      });

      draftCaption = generated.caption;
      draftHashtags = generated.hashtags;
      captionFinal = params.socialCaptionOverride?.trim() || null;

      if (!mediaUrl) {
        try {
          mediaUrl = await generateAndUploadPromoImage({
            businessSlug: params.businessSlug,
            businessName: business.name,
            title: params.title,
            saleDescription: params.description,
            captionText: captionFinal || draftCaption,
            discountType: params.discountType,
            discountValue: params.discountValue,
            startDate: params.startDate,
            endDate: params.endDate,
            serviceNames: business.services.map((service) => service.name),
            serviceCategories: Array.from(
              new Set(business.services.map((service) => service.category)),
            ),
            packageNames: business.packages.map((pkg) => pkg.name),
            imageProfile: params.socialImageProfile,
          });
        } catch (error) {
          console.warn("Failed to auto-generate social promo image:", error);
          mediaUrl = null;
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      const saleEvent = await tx.saleEvent.create({
        data: {
          title: params.title,
          description: params.description,
          start_date: params.startDate,
          end_date: params.endDate,
          discount_type: params.discountType,
          discount_value: params.discountValue,
          slot_limit: params.slotLimit ?? null,
          business_id: business.id,
          applicable_services: {
            connect: serviceIds.map((id) => ({ id })),
          },
          applicable_packages: {
            connect: packageIds.map((id) => ({ id })),
          },
        },
      });

      if (!shouldCreateSocialDraft) {
        return;
      }

      const socialPost = await tx.socialPost.create({
        data: {
          business_id: business.id,
          sale_event_id: saleEvent.id,
          source: "SALE_EVENT",
          status: captionFinal ? "READY" : "DRAFT",
          title: `${params.title} Social Draft`,
          caption_draft: draftCaption,
          caption_final: captionFinal,
          hashtags: draftHashtags,
          media_url: mediaUrl,
          created_by_user_id: auth.session.user.id,
        },
      });

      await tx.socialPostTarget.createMany({
        data: connectedTargets.map((target) => ({
          social_post_id: socialPost.id,
          social_connection_id: target.id,
          status: "SKIPPED",
        })),
      });

      await tx.auditLog.create({
        data: {
          entity_type: "SocialPost",
          entity_id: socialPost.id,
          action: "DRAFT_CREATED",
          actor_id: auth.session.user.id,
          actor_type: "USER",
          business_id: business.id,
          changes: {
            saleEventId: saleEvent.id,
            targetPlatforms: connectedTargets.map((target) => target.platform),
          },
        },
      });
    });

    revalidatePath(`/app/${params.businessSlug}/sale-events`);
    revalidatePath(`/app/${params.businessSlug}/social-posts`);
    revalidateTag(tenantCacheTags.businessBySlug(params.businessSlug), "max");
    return { success: true };
  } catch (error) {
    console.error("Error creating sale event:", error);
    return { success: false, error: "Failed to create sale event" };
  }
}

export async function updateSaleEvent(params: UpdateSaleEventParams) {
  const auth = await requireOwnerTenantWriteAccess(params.businessSlug);
  if (!auth.success) return auth;

  try {
    const serviceIds = Array.from(new Set(params.serviceIds));
    const packageIds = Array.from(new Set(params.packageIds));

    if (serviceIds.length === 0 && packageIds.length === 0) {
      return {
        success: false,
        error: "Select at least one service or package for this sale event.",
      };
    }

    const existing = await prisma.saleEvent.findFirst({
      where: {
        id: params.id,
        business: { slug: params.businessSlug },
      },
      select: { id: true, business_id: true },
    });

    if (!existing) {
      return {
        success: false,
        error: "Sale event not found or unauthorized.",
      };
    }

    const business = await prisma.business.findUnique({
      where: { id: existing.business_id },
      include: {
        services: {
          where: { id: { in: serviceIds } },
          select: { id: true },
        },
        packages: {
          where: { id: { in: packageIds } },
          select: { id: true },
        },
      },
    });

    if (!business) {
      return { success: false, error: "Business not found." };
    }

    if (business.services.length !== serviceIds.length) {
      return {
        success: false,
        error: "One or more selected services are invalid for this business.",
      };
    }

    if (business.packages.length !== packageIds.length) {
      return {
        success: false,
        error: "One or more selected packages are invalid for this business.",
      };
    }

    await prisma.saleEvent.update({
      where: { id: existing.id },
      data: {
        title: params.title,
        description: params.description,
        start_date: params.startDate,
        end_date: params.endDate,
        discount_type: params.discountType,
        discount_value: params.discountValue,
        applicable_services: {
          set: [],
          connect: serviceIds.map((id) => ({ id })),
        },
        applicable_packages: {
          set: [],
          connect: packageIds.map((id) => ({ id })),
        },
      },
    });

    revalidatePath(`/app/${params.businessSlug}/sale-events`);
    revalidateTag(tenantCacheTags.businessBySlug(params.businessSlug), "max");
    return { success: true };
  } catch (error) {
    console.error("Error updating sale event:", error);
    return { success: false, error: "Failed to update sale event" };
  }
}

export async function getActiveSaleEvents(businessSlug: string) {
  try {
    const now = new Date();
    const saleEvents = await prisma.saleEvent.findMany({
      where: {
        business: { slug: businessSlug },
        start_date: { lte: now },
        end_date: { gte: now },
      },
      include: {
        applicable_services: { select: { id: true } },
        applicable_packages: { select: { id: true } },
        _count: {
          select: {
            bookings: { where: { status: { not: "CANCELLED" } } },
          },
        },
      },
    });

    const data = saleEvents.map((event) => {
      const { _count, ...rest } = event;
      return {
        ...rest,
        slots_remaining:
          rest.slot_limit !== null
            ? Math.max(0, rest.slot_limit - _count.bookings)
            : null,
      };
    });

    return { success: true, data };
  } catch (error) {
    console.error("Error fetching active sale events:", error);
    return { success: false, error: "Failed to fetch active sale events" };
  }
}

export async function deleteSaleEvent(id: number, businessSlug: string) {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) return auth;

  try {
    const deleted = await prisma.saleEvent.deleteMany({
      where: {
        id,
        business: {
          slug: businessSlug,
        },
      },
    });

    if (deleted.count === 0) {
      return { success: false, error: "Sale event not found or unauthorized." };
    }

    revalidatePath(`/app/${businessSlug}/sale-events`);
    revalidateTag(tenantCacheTags.businessBySlug(businessSlug), "max");
    return { success: true };
  } catch (error) {
    console.error("Error deleting sale event:", error);
    return { success: false, error: "Failed to delete sale event" };
  }
}
