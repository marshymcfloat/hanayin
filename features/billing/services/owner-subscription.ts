import "server-only";
import { createInvoiceForSubscription, ensureDefaultPlans } from "@/features/billing/subscription-service";
import { getOwnerSubscriptionId } from "@/features/billing/queries/owner-subscription";
import { ownerSubscriptionBusinessFilter, recheckOwnerSubscriptionActor, type OwnerSubscriptionActor } from "@/features/billing/owner-subscription-access";
import type { OwnerManualPaymentInput, OwnerPlanUpgradeInput } from "@/features/billing/owner-subscription-schemas";
import { getCurrentDateTimePH } from "@/lib/date-utils";
import { publishEvent } from "@/lib/services/outbox";
import { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";

const options = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 };
const denied = () => ({ success: false as const, error: "Forbidden" });
const duplicate = () => ({ success: false as const, error: "Manual payment already submitted for this invoice. Wait for verification before sending another reference." });

export async function createOwnerSubscriptionInvoice(actor: OwnerSubscriptionActor, reason: string) {
  const subscriptionId = await getOwnerSubscriptionId(actor);
  if (!subscriptionId) return { success: false as const, error: "Subscription not found" };
  // Existing financial helper owns its transaction; revocation/credit races need a separate slice.
  const data = await createInvoiceForSubscription(subscriptionId, reason);
  return { success: true as const, data: { id: data.id, status: data.status } };
}

export async function requestOwnerPlanUpgrade(actor: OwnerSubscriptionActor, input: OwnerPlanUpgradeInput) {
  await ensureDefaultPlans();
  return prisma.$transaction(async tx => {
    if (!(await recheckOwnerSubscriptionActor(tx, actor))) return denied();
    const business = await tx.business.findFirst({ where: ownerSubscriptionBusinessFilter(actor), select: { id: true, subscriptions: { take: 1, select: { id: true, plan_id: true, plan: { select: { id: true, code: true, price_amount: true } } } } } });
    if (!business) return { success: false as const, error: "Business not found" };
    const subscription = business.subscriptions[0];
    if (!subscription) return { success: false as const, error: "Subscription not found" };
    if (subscription.plan.code === input.targetPlanCode) return { success: false as const, error: "You are already on this plan." };
    const targetPlan = await tx.subscriptionPlan.findUnique({ where: { code: input.targetPlanCode }, select: { id: true, code: true, name: true, price_amount: true, is_active: true } });
    if (!targetPlan || !targetPlan.is_active) return { success: false as const, error: "Selected plan is not active." };
    if (targetPlan.price_amount <= subscription.plan.price_amount) return { success: false as const, error: "Only upgrades to a higher-tier plan can be requested." };
    const pending = await tx.subscriptionPlanUpgradeRequest.findFirst({ where: { business_id: actor.businessId, status: "PENDING" }, include: { target_plan: { select: { name: true, code: true } } }, orderBy: { created_at: "desc" } });
    if (pending) return { success: false as const, error: `A pending upgrade request already exists for ${pending.target_plan.name} (${pending.target_plan.code}).` };
    const data = await tx.subscriptionPlanUpgradeRequest.create({ data: { business_id: actor.businessId, business_subscription_id: subscription.id, requested_by_user_id: actor.userId, current_plan_id: subscription.plan_id, target_plan_id: targetPlan.id, request_note: input.note || null } });
    return { success: true as const, data: { id: data.id, status: data.status, targetPlanCode: targetPlan.code } };
  }, options);
}

export async function submitOwnerManualPayment(actor: OwnerSubscriptionActor, input: OwnerManualPaymentInput) {
  return prisma.$transaction(async tx => {
    if (!(await recheckOwnerSubscriptionActor(tx, actor))) return denied();
    const invoice = await tx.subscriptionInvoice.findFirst({ where: { id: input.invoiceId, business_id: actor.businessId, business: ownerSubscriptionBusinessFilter(actor), business_subscription: { business_id: actor.businessId } }, select: { id: true, status: true, business_id: true, metadata: true, updated_at: true, amount_paid: true, paid_at: true } });
    if (!invoice) return { success: false as const, error: "Invoice not found" };
    if (invoice.status !== "OPEN" && invoice.status !== "DRAFT") return { success: false as const, error: "Manual payment can only be submitted for open invoices." };
    const existing = invoice.metadata && typeof invoice.metadata === "object" && !Array.isArray(invoice.metadata) ? invoice.metadata as Record<string, unknown> : {};
    if (typeof existing.manual_payment_submitted_at === "string" && existing.manual_payment_submitted_at.trim()) return duplicate();
    const submittedAt = getCurrentDateTimePH().toISOString();
    const next = { ...existing, manual_payment_reference: input.paymentReference, manual_payment_submitted_at: submittedAt } as Record<string, unknown>;
    if (typeof input.amountCentavos === "number") next.manual_payment_amount_centavos = input.amountCentavos; else delete next.manual_payment_amount_centavos;
    if (input.note) next.manual_payment_note = input.note; else delete next.manual_payment_note;
    if (input.proofUrl) next.manual_payment_proof_url = input.proofUrl; else delete next.manual_payment_proof_url;
    const changed = await tx.subscriptionInvoice.updateMany({ where: { id: invoice.id, business_id: actor.businessId, business: ownerSubscriptionBusinessFilter(actor), business_subscription: { business_id: actor.businessId }, status: invoice.status, updated_at: invoice.updated_at, amount_paid: invoice.amount_paid, paid_at: invoice.paid_at, metadata: { equals: invoice.metadata === null ? Prisma.AnyNull : invoice.metadata } }, data: { metadata: next as Prisma.InputJsonValue } });
    if (changed.count !== 1) throw new Error("Invoice changed during manual payment submission");
    await publishEvent(tx, { type: "MANUAL_PAYMENT_SUBMITTED", aggregateType: "SubscriptionInvoice", aggregateId: invoice.id, businessId: actor.businessId, payload: { invoiceId: invoice.id, businessId: actor.businessId, businessSlug: actor.businessSlug, submittedByUserId: actor.userId, paymentReference: input.paymentReference, amountCentavos: input.amountCentavos, note: input.note, proofUrl: input.proofUrl, submittedAt } });
    const data = await tx.subscriptionInvoice.findFirstOrThrow({ where: { id: invoice.id, business_id: actor.businessId }, select: { id: true, status: true } });
    return { success: true as const, data };
  }, options);
}
