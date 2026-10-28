import "server-only";
import { prisma } from "@/prisma/prisma";
import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import { isSocialPublishingEnabledForBusiness } from "@/features/social/social-publishing";
import { generateSocialCaptionDraft } from "@/lib/services/social/caption-generator";
import { generateAndUploadPromoImage } from "@/lib/services/social/promo-image";
import { SaleEventError, type SaleEventActorContext } from "@/features/catalog/sale-event-access";
import { getSaleEventCreationContext } from "@/features/catalog/queries/sale-event-administration";
import { commitSaleEventCreation } from "@/features/catalog/services/sale-event-administration";
import type { CreateSaleEventInput } from "@/features/catalog/sale-event-schemas";
import type { PreparedSaleSocialDraft } from "@/features/catalog/sale-event-types";
import { conditionalSaleSummary } from "@/features/catalog/offer-definitions";

export async function createTenantSaleEvent(context: SaleEventActorContext, input: CreateSaleEventInput) {
  if (context.actorType !== "OWNER") throw new SaleEventError("Forbidden");
  let draft: PreparedSaleSocialDraft | null = null;
  if (input.createSocialDraft) {
    const business = await getSaleEventCreationContext(context, input);
    const entitlements = await getBusinessEntitlementsBySlug(context.businessSlug);
    if (!entitlements.social) throw new SaleEventError("Social publishing is available on the Pro plan.");
    if (!isSocialPublishingEnabledForBusiness(context.businessSlug)) throw new SaleEventError("Social publishing is not enabled for this business yet. Contact support to join the pilot.");
    if (!input.targetPlatforms?.length) throw new SaleEventError("Please select at least one connected platform.");
    const targets = await prisma.socialConnection.findMany({ where: { business_id: context.businessId, status: "CONNECTED", platform: { in: input.targetPlatforms } }, select: { id: true, platform: true } });
    if (!targets.length) throw new SaleEventError("No connected social channels were found. Connect Facebook or Instagram first.");
    const names = {
      serviceNames: business.services.map(service => service.name),
      serviceCategories: Array.from(new Set(business.services.map(service => service.category))),
      packageNames: business.packages.map(pkg => pkg.name),
    };
    const generated = await generateSocialCaptionDraft({
      businessSlug: context.businessSlug, businessName: business.name, businessDescription: business.description,
      saleTitle: input.title, saleDescription: input.conditionalRule ? `${input.description ?? ""}\n${conditionalSaleSummary(input.conditionalRule, input.discountType, input.discountValue)}` : input.description, discountType: input.discountType,
      discountValue: input.discountValue, startDate: input.startDate, endDate: input.endDate, ...names,
    });
    const captionFinal = input.socialCaptionOverride?.trim() || null;
    let mediaUrl = input.socialMediaUrl || null;
    if (!mediaUrl) {
      try {
        mediaUrl = await generateAndUploadPromoImage({
          businessSlug: context.businessSlug, businessName: business.name, title: input.title,
          saleDescription: input.description, captionText: captionFinal || generated.caption,
          discountType: input.discountType, discountValue: input.discountValue, startDate: input.startDate,
          endDate: input.endDate, ...names, imageProfile: input.socialImageProfile, ownerImageDirection: input.socialImageDirection,
        });
      } catch { mediaUrl = null; }
    }
    draft = { targets, caption: generated.caption, hashtags: generated.hashtags, captionFinal, mediaUrl };
  }
  await commitSaleEventCreation(context, input, draft);
}
