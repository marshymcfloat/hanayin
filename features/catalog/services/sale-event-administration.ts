import "server-only";
import { prisma } from "@/prisma/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import { validateOfferRules } from "@/features/catalog/services/offer-rule-validation";
import { SaleEventError, saleEventBusinessWhere, type SaleEventActorContext } from "@/features/catalog/sale-event-access";
import { getSaleEventCreationContext } from "@/features/catalog/queries/sale-event-administration";
import type { CreateSaleEventInput, UpdateSaleEventInput } from "@/features/catalog/sale-event-schemas";
import type { PreparedSaleSocialDraft } from "@/features/catalog/sale-event-types";

const transactionOptions = { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 } as const;
const NOT_FOUND = "Sale event not found or unauthorized.";
function assertOwner(context: SaleEventActorContext) {
  if (context.actorType !== "OWNER") throw new SaleEventError("Forbidden");
}
const details = (input: CreateSaleEventInput | UpdateSaleEventInput) => ({
  ...(input.conditionalRule === undefined ? {} : { conditional_rule: input.conditionalRule ?? Prisma.DbNull }),
  title: input.title, description: input.description, start_date: input.startDate,
  end_date: input.endDate, discount_type: input.discountType, discount_value: input.discountValue,
});
const relation = (ids: number[], businessId: string) => ids.map(id => ({ id, business_id: businessId }));
export async function commitSaleEventCreation(context: SaleEventActorContext, input: CreateSaleEventInput, draft: PreparedSaleSocialDraft | null) {
  assertOwner(context);
  if (!!input.createSocialDraft !== !!draft || (draft && !draft.targets.length)) throw new SaleEventError("Invalid social draft.");
  await prisma.$transaction(async tx => {
    await getSaleEventCreationContext(context, input, tx);
    try { await validateOfferRules(tx, context.businessId, input.conditionalRule?.groups ?? []); } catch (error) { throw new SaleEventError(error instanceof Error ? error.message : "Invalid service groups."); }
    if (draft) {
      const currentTargets = await tx.socialConnection.findMany({
        where: { business_id: context.businessId, status: "CONNECTED", id: { in: draft.targets.map(target => target.id) }, platform: { in: draft.targets.map(target => target.platform) } }, select: { id: true, platform: true },
      });
      if (currentTargets.length !== draft.targets.length || draft.targets.some(target => !currentTargets.some(current => current.id === target.id && current.platform === target.platform))) throw new SaleEventError("Connected social channels changed. Refresh and try again.");
    }
    const sale = await tx.saleEvent.create({ data: {
      ...details(input), slot_limit: input.slotLimit ?? null, business_id: context.businessId,
      applicable_services: { connect: relation(input.serviceIds, context.businessId) },
      applicable_packages: { connect: relation(input.packageIds, context.businessId) },
    }, select: { id: true } });
    if (!draft) return;
    const post = await tx.socialPost.create({ data: {
      business_id: context.businessId, sale_event_id: sale.id, source: "SALE_EVENT",
      status: draft.captionFinal ? "READY" : "DRAFT", title: `${input.title} Social Draft`,
      caption_draft: draft.caption, caption_final: draft.captionFinal, hashtags: draft.hashtags,
      media_url: draft.mediaUrl, created_by_user_id: context.userId,
    }, select: { id: true } });
    await tx.socialPostTarget.createMany({ data: draft.targets.map(target => ({ social_post_id: post.id, social_connection_id: target.id, status: "SKIPPED" })) });
    await tx.auditLog.create({ data: {
      entity_type: "SocialPost", entity_id: post.id, action: "DRAFT_CREATED", actor_id: context.userId,
      actor_type: "USER", business_id: context.businessId,
      changes: { saleEventId: sale.id, targetPlatforms: draft.targets.map(target => target.platform) },
    }, select: { id: true } });
  }, transactionOptions);
}
async function assertCurrentOwner(tx: Prisma.TransactionClient, context: SaleEventActorContext) {
  const business = await tx.business.findFirst({ where: saleEventBusinessWhere(context), select: { id: true } });
  if (!business) throw new SaleEventError("Forbidden");
}
export async function updateTenantSaleEvent(context: SaleEventActorContext, input: UpdateSaleEventInput) {
  assertOwner(context);
  await prisma.$transaction(async tx => {
    await assertCurrentOwner(tx, context);
    const existing = await tx.saleEvent.findFirst({ where: { id: input.id, business_id: context.businessId }, select: { id: true, revision: true, conditional_rule: true } });
    if (!existing) throw new SaleEventError(NOT_FOUND);
    if (input.expectedRevision !== undefined && input.expectedRevision !== existing.revision || existing.conditional_rule && input.expectedRevision === undefined) throw new SaleEventError("Offer settings changed. Refresh before editing this offer.");
    try { await validateOfferRules(tx, context.businessId, input.conditionalRule?.groups ?? []); } catch (error) { throw new SaleEventError(error instanceof Error ? error.message : "Invalid service groups."); }
    const serviceCount = await tx.service.count({ where: { id: { in: input.serviceIds }, business_id: context.businessId } });
    if (serviceCount !== input.serviceIds.length) throw new SaleEventError("One or more selected services are invalid for this business.");
    const packageCount = await tx.servicePackage.count({ where: { id: { in: input.packageIds }, business_id: context.businessId } });
    if (packageCount !== input.packageIds.length) throw new SaleEventError("One or more selected packages are invalid for this business.");
    await tx.saleEvent.update({ where: { id: existing.id, business_id: context.businessId, ...(input.expectedRevision === undefined ? {} : { revision: input.expectedRevision }) }, data: { ...details(input), revision: { increment: 1 },
      slot_limit: input.slotLimit ?? null,
      applicable_services: { set: [], connect: relation(input.serviceIds, context.businessId) },
      applicable_packages: { set: [], connect: relation(input.packageIds, context.businessId) },
    }, select: { id: true } });
  }, transactionOptions);
}
export async function deleteTenantSaleEvent(context: SaleEventActorContext, id: number) {
  assertOwner(context);
  await prisma.$transaction(async tx => {
    await assertCurrentOwner(tx, context);
    const deleted = await tx.saleEvent.deleteMany({ where: { id, business_id: context.businessId } });
    if (deleted.count !== 1) throw new SaleEventError(NOT_FOUND);
  }, transactionOptions);
}
