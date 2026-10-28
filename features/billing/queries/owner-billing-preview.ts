import "server-only";

import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { ownerSubscriptionBusinessFilter, type OwnerSubscriptionActor } from "@/features/billing/owner-subscription-access";
import { resolveEntitlements } from "@/features/billing/plan-entitlements";
import { getManualPaymentMetadata } from "@/features/billing/queries/workspace";
import { SUBSCRIPTION_PLAN_CODES } from "@/features/billing/subscription-service";
import type { OwnerBillingPreviewData } from "@/features/billing/types/owner-billing-preview";

type BillingDb = Pick<Prisma.TransactionClient, "business" | "businessSubscription" | "subscriptionPlan" | "subscriptionPlanUpgradeRequest">;

export async function getOwnerBillingPreviewData(
  actor: OwnerSubscriptionActor,
  db: BillingDb = prisma,
): Promise<OwnerBillingPreviewData | null> {
  const business = await db.business.findFirst({
    where: ownerSubscriptionBusinessFilter(actor),
    select: { name: true, referral_code: { select: { code: true } }, referral_attributions_as_referrer: { orderBy: { created_at: "desc" }, take: 20, select: { id: true, status: true, created_at: true, referred_business: { select: { name: true } } } } },
  });
  if (!business) return null;

  const subscription = await db.businessSubscription.findFirst({
    where: { business_id: actor.businessId, business: ownerSubscriptionBusinessFilter(actor) },
    select: {
      status: true,
      current_period_end: true,
      plan: { select: { name: true, code: true, price_amount: true } },
      credits: { select: { amount_total: true } },
      invoices: {
        where: { business_id: actor.businessId },
        orderBy: { created_at: "desc" },
        take: 20,
        select: { id: true, created_at: true, period_start: true, period_end: true, due_at: true, status: true, amount_subtotal: true, amount_credit_applied: true, amount_due: true, amount_paid: true, paid_at: true, metadata: true },
      },
    },
  });

  if (!subscription) return {
    businessName: business.name,
    subscription: null,
    availableUpgradePlanNames: [],
    availableUpgradePlans: [],
    pendingUpgradeRequest: null,
    referral: null,
    invoices: [],
    upgradeRequests: [],
  };

  const [availableUpgradePlans, upgradeRequests, pendingUpgradeRequest] = await Promise.all([
    db.subscriptionPlan.findMany({
      where: { code: { in: [...SUBSCRIPTION_PLAN_CODES] }, is_active: true, price_amount: { gt: subscription.plan.price_amount } },
      orderBy: [{ price_amount: "asc" }, { code: "asc" }],
      select: { code: true, name: true, price_amount: true },
    }),
    db.subscriptionPlanUpgradeRequest.findMany({
      where: { business_id: actor.businessId },
      orderBy: { created_at: "desc" },
      take: 6,
      select: {
        id: true,
        status: true,
        created_at: true,
        reviewed_at: true,
        current_plan: { select: { code: true } },
        target_plan: { select: { code: true } },
      },
    }),
    db.subscriptionPlanUpgradeRequest.findFirst({
      where: { business_id: actor.businessId, status: "PENDING" },
      orderBy: { created_at: "desc" },
      select: { id: true, target_plan: { select: { code: true } } },
    }),
  ]);

  return {
    businessName: business.name,
    subscription: {
      planName: subscription.plan.name,
      planCode: subscription.plan.code,
      status: subscription.status,
      periodEnd: subscription.current_period_end?.toISOString() ?? null,
      entitlements: resolveEntitlements(subscription.plan.code),
    },
    availableUpgradePlanNames: availableUpgradePlans.map((plan) => plan.name),
    availableUpgradePlans: availableUpgradePlans.map((plan) => ({ code: plan.code, name: plan.name, priceAmount: plan.price_amount })),
    pendingUpgradeRequest: pendingUpgradeRequest ? { id: pendingUpgradeRequest.id, targetPlanCode: pendingUpgradeRequest.target_plan.code } : null,
    referral: {
      code: business.referral_code?.code ?? null,
      earnedCredits: subscription.credits.reduce((total, credit) => total + credit.amount_total, 0),
      attributions: business.referral_attributions_as_referrer.map((item) => ({ id: item.id, businessName: item.referred_business.name, status: item.status, createdAt: item.created_at.toISOString() })),
    },
    invoices: subscription.invoices.map((invoice) => ({
      id: invoice.id,
      createdAt: invoice.created_at.toISOString(),
      periodStart: invoice.period_start.toISOString(),
      periodEnd: invoice.period_end.toISOString(),
      dueAt: invoice.due_at.toISOString(),
      status: invoice.status,
      amountSubtotal: invoice.amount_subtotal,
      amountCreditApplied: invoice.amount_credit_applied,
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      paidAt: invoice.paid_at?.toISOString() ?? null,
      paymentReference: getManualPaymentMetadata(invoice.metadata).reference ?? null,
      paymentSubmittedAt: getManualPaymentMetadata(invoice.metadata).submittedAt ?? null,
    })),
    upgradeRequests: upgradeRequests.map((request) => ({
      id: request.id,
      currentPlanCode: request.current_plan.code,
      targetPlanCode: request.target_plan.code,
      status: request.status,
      createdAt: request.created_at.toISOString(),
      reviewedAt: request.reviewed_at?.toISOString() ?? null,
    })),
  };
}
