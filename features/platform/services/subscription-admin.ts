import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import { authOptions } from "@/features/auth/auth-options";
import {
  addMonths,
  createInvoiceForSubscription,
  ensureBusinessSubscription,
  ensureDefaultPlans,
  getPeriodEnd,
  getSubscriptionEnforcementMode as resolveSubscriptionEnforcementMode,
  markInvoicePaid,
  SUBSCRIPTION_PLAN_CODES,
} from "@/features/billing/subscription-service";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { Prisma } from "@/prisma/generated/prisma/client";
import { SubscriptionStatus } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { z } from "zod";
import { logPlatformAction } from "./platform-action-log";

async function logSubscriptionAdminAction(input: {
  action: string;
  targetType: string;
  targetId: string;
  businessId?: string;
  metadata?: Record<string, unknown>;
}) {
  const session = await getServerSession(authOptions);
  await prisma.platformActionLog.create({
    data: {
      actor_user: session?.user?.id
        ? { connect: { id: session.user.id } }
        : undefined,
      actor_identifier: session?.user?.contactNumber ?? null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      business: input.businessId
        ? { connect: { id: input.businessId } }
        : undefined,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

function isCanonicalSubscriptionPlanCode(code: string) {
  return SUBSCRIPTION_PLAN_CODES.includes(
    code as (typeof SUBSCRIPTION_PLAN_CODES)[number],
  );
}

export async function grantTrialMonths(businessId: string, months: number) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const safeMonths = Math.max(1, Math.min(12, months));
  const subscription = await ensureBusinessSubscription(businessId, {
    trialMonths: safeMonths,
  });
  if (subscription.status !== SubscriptionStatus.TRIALING) {
    return {
      success: false as const,
      error: "Trial months can only be granted to trialing subscriptions.",
    };
  }

  const now = new Date();
  const trialAnchor =
    subscription.trial_ends_at && subscription.trial_ends_at > now
      ? subscription.trial_ends_at
      : now;
  const periodAnchor =
    subscription.current_period_end > now
      ? subscription.current_period_end
      : now;
  const nextTrialEndsAt = addMonths(trialAnchor, safeMonths);
  const nextPeriodEnd = addMonths(periodAnchor, safeMonths);

  const updated = await prisma.businessSubscription.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.TRIALING,
      trial_ends_at: nextTrialEndsAt,
      current_period_end: nextPeriodEnd,
      grace_ends_at: null,
      suspended_at: null,
    },
  });

  await logSubscriptionAdminAction({
    action: "TRIAL_MONTHS_GRANTED",
    targetType: "BusinessSubscription",
    targetId: updated.id,
    businessId,
    metadata: { months: safeMonths },
  });

  revalidatePath("/platform/businesses");
  revalidatePath("/platform");
  return { success: true as const, data: updated };
}

export async function getSubscriptionEnforcementMode() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  return {
    success: true as const,
    mode: resolveSubscriptionEnforcementMode(),
  };
}

export async function updateSubscriptionPlan(params: {
  planId: string;
  priceAmount: number;
  isActive: boolean;
}) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const existing = await prisma.subscriptionPlan.findUnique({
    where: { id: params.planId },
    select: { id: true, code: true },
  });
  if (!existing) {
    return { success: false as const, error: "Plan not found" };
  }
  const isCanonical = isCanonicalSubscriptionPlanCode(existing.code);
  const updated = await prisma.subscriptionPlan.update({
    where: { id: existing.id },
    data: {
      price_amount: Math.max(1, Math.round(params.priceAmount)),
      is_active: isCanonical ? params.isActive : false,
    },
  });

  await logSubscriptionAdminAction({
    action: "SUBSCRIPTION_PLAN_UPDATED",
    targetType: "SubscriptionPlan",
    targetId: updated.id,
    metadata: {
      priceAmount: updated.price_amount,
      isActive: updated.is_active,
      isCanonicalPlan: isCanonical,
    },
  });

  revalidatePath("/platform/plans");
  revalidatePath("/platform/businesses");
  revalidatePath("/platform/applications");
  return { success: true as const, data: updated };
}

const changeBusinessSubscriptionPlanSchema = z.object({
  businessId: z.string().min(1),
  planCode: z.enum(SUBSCRIPTION_PLAN_CODES),
});

const reviewSubscriptionPlanUpgradeRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
  reviewNote: z.string().trim().max(1000).optional(),
});

export async function applyCreditAdjustment(
  businessId: string,
  amountOrMonths: { amountCentavos?: number; months?: number },
  reason: string,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const subscription = await ensureBusinessSubscription(businessId);
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: subscription.plan_id },
    select: { price_amount: true },
  });
  if (!plan) return { success: false as const, error: "Plan not found" };

  const amountCentavos =
    amountOrMonths.amountCentavos ??
    Math.max(1, amountOrMonths.months ?? 1) * plan.price_amount;
  const credit = await prisma.subscriptionCreditLedger.create({
    data: {
      business_subscription_id: subscription.id,
      source: "ADMIN_ADJUSTMENT",
      amount_total: amountCentavos,
      amount_remaining: amountCentavos,
      description: reason,
    },
  });
  await logPlatformAction({
    action: "SUBSCRIPTION_CREDIT_ADJUSTED",
    targetType: "SubscriptionCreditLedger",
    targetId: credit.id,
    businessId,
    metadata: { reason, amountCentavos },
  });
  revalidatePath("/platform/businesses");
  revalidatePath("/platform/referrals");
  return { success: true as const, data: credit };
}

export async function changeBusinessSubscriptionPlan(
  businessId: string,
  planCode: z.infer<typeof changeBusinessSubscriptionPlanSchema>["planCode"],
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  const input = changeBusinessSubscriptionPlanSchema.parse({
    businessId,
    planCode,
  });
  await ensureDefaultPlans();
  const subscription = await ensureBusinessSubscription(input.businessId);
  if (subscription.plan.code === input.planCode) {
    return { success: true as const, data: subscription };
  }
  const nextPlan = await prisma.subscriptionPlan.findUnique({
    where: { code: input.planCode },
    select: { id: true, code: true, is_active: true, billing_interval: true },
  });
  if (!nextPlan || !nextPlan.is_active) {
    return { success: false as const, error: "Selected plan is not active" };
  }
  const now = new Date();
  const periodReset =
    subscription.status === SubscriptionStatus.ACTIVE
      ? {
          current_period_start: now,
          current_period_end: getPeriodEnd(now, nextPlan.billing_interval),
        }
      : {};
  const updated = await prisma.businessSubscription.update({
    where: { id: subscription.id },
    data: { plan_id: nextPlan.id, ...periodReset },
    include: { plan: true },
  });
  let invoiceId: string | null = null;
  if (subscription.status === SubscriptionStatus.ACTIVE) {
    const invoice = await createInvoiceForSubscription(
      updated.id,
      "PLAN_CHANGE",
    );
    invoiceId = invoice.id;
  }
  await logPlatformAction({
    action: "BUSINESS_SUBSCRIPTION_PLAN_CHANGED",
    targetType: "BusinessSubscription",
    targetId: updated.id,
    businessId: input.businessId,
    metadata: {
      previousPlanCode: subscription.plan.code,
      nextPlanCode: updated.plan.code,
      periodReset: subscription.status === SubscriptionStatus.ACTIVE,
      invoiceId,
    },
  });
  revalidatePath("/platform/businesses");
  revalidatePath("/platform/plans");
  revalidatePath("/platform/invoices");
  revalidatePath("/platform");
  return { success: true as const, data: updated };
}

export async function reviewSubscriptionPlanUpgradeRequest(
  rawInput: z.input<typeof reviewSubscriptionPlanUpgradeRequestSchema>,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  const input = reviewSubscriptionPlanUpgradeRequestSchema.parse(rawInput);
  const request = await prisma.subscriptionPlanUpgradeRequest.findUnique({
    where: { id: input.requestId },
    include: {
      business: { select: { id: true, slug: true } },
      target_plan: { select: { id: true, code: true, is_active: true } },
      current_plan: { select: { code: true } },
    },
  });
  if (!request)
    return { success: false as const, error: "Upgrade request not found" };
  if (request.status !== "PENDING") {
    return {
      success: false as const,
      error: "Upgrade request is already reviewed.",
    };
  }
  if (input.decision === "APPROVE") {
    if (!request.target_plan.is_active) {
      return { success: false as const, error: "Target plan is not active." };
    }
    const approved = await prisma.$transaction(async (tx) => {
      const liveSubscription = await tx.businessSubscription.findUnique({
        where: { id: request.business_subscription_id },
        select: { id: true, plan_id: true },
      });
      if (!liveSubscription)
        throw new Error("Subscription not found for this upgrade request.");
      if (
        liveSubscription.plan_id !== request.current_plan_id &&
        liveSubscription.plan_id !== request.target_plan.id
      ) {
        throw new Error(
          "Subscription plan changed after request creation. Ask the owner to submit a new request.",
        );
      }
      if (liveSubscription.plan_id !== request.target_plan.id) {
        await tx.businessSubscription.update({
          where: { id: liveSubscription.id },
          data: { plan_id: request.target_plan.id },
        });
      }
      return tx.subscriptionPlanUpgradeRequest.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          review_note: input.reviewNote || null,
          reviewed_by_user_id: auth.session.user.id,
          reviewed_at: new Date(),
        },
      });
    });
    await logPlatformAction({
      action: "SUBSCRIPTION_UPGRADE_REQUEST_APPROVED",
      targetType: "SubscriptionPlanUpgradeRequest",
      targetId: approved.id,
      businessId: request.business.id,
      metadata: {
        previousPlanCode: request.current_plan.code,
        nextPlanCode: request.target_plan.code,
        hasReviewNote: Boolean(input.reviewNote),
      },
    });
    revalidatePath("/platform");
    revalidatePath("/platform/businesses");
    revalidatePath("/platform/invoices");
    revalidatePath(`/app/${request.business.slug}/billing`);
    return { success: true as const, data: approved };
  }
  const rejected = await prisma.subscriptionPlanUpgradeRequest.update({
    where: { id: request.id },
    data: {
      status: "REJECTED",
      review_note: input.reviewNote || null,
      reviewed_by_user_id: auth.session.user.id,
      reviewed_at: new Date(),
    },
  });
  await logPlatformAction({
    action: "SUBSCRIPTION_UPGRADE_REQUEST_REJECTED",
    targetType: "SubscriptionPlanUpgradeRequest",
    targetId: rejected.id,
    businessId: request.business.id,
    metadata: {
      requestedPlanCode: request.target_plan.code,
      hasReviewNote: Boolean(input.reviewNote),
    },
  });
  revalidatePath("/platform");
  revalidatePath("/platform/businesses");
  revalidatePath(`/app/${request.business.slug}/billing`);
  return { success: true as const, data: rejected };
}

export async function convertTrialToPaid(input: {
  businessId: string;
  paymentReference: string;
}) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  if (!input.paymentReference?.trim()) {
    return { success: false as const, error: "Payment reference is required" };
  }
  const subscription = await ensureBusinessSubscription(input.businessId);
  if (subscription.status !== SubscriptionStatus.TRIALING) {
    return {
      success: false as const,
      error: `Subscription is in status ${subscription.status}, not TRIALING.`,
    };
  }
  const now = new Date();
  const nextPeriodEnd = getPeriodEnd(now, subscription.plan.billing_interval);
  const updatedSubscription = await prisma.businessSubscription.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      trial_ends_at: null,
      current_period_start: now,
      current_period_end: nextPeriodEnd,
      grace_ends_at: null,
      suspended_at: null,
    },
  });
  const invoice = await createInvoiceForSubscription(
    updatedSubscription.id,
    "TRIAL_CONVERTED_TO_PAID",
  );
  await markInvoicePaid({
    invoiceId: invoice.id,
    paidAmountCentavos:
      invoice.amount_due > 0
        ? invoice.amount_due
        : Math.max(1, invoice.amount_paid),
  });
  await prisma.subscriptionInvoice.update({
    where: { id: invoice.id },
    data: {
      paid_at: now,
      metadata: {
        collection_mode: "MANUAL",
        payment_reference: input.paymentReference.trim(),
        marked_by_admin: auth.session.user.id,
        marked_at: now.toISOString(),
        reason: "TRIAL_CONVERTED_TO_PAID",
      } as Prisma.InputJsonValue,
    },
  });
  await logPlatformAction({
    action: "TRIAL_CONVERTED_TO_PAID",
    targetType: "BusinessSubscription",
    targetId: updatedSubscription.id,
    businessId: input.businessId,
    metadata: {
      invoiceId: invoice.id,
      paymentReference: input.paymentReference.trim(),
    },
  });
  revalidatePath("/platform/businesses");
  revalidatePath("/platform/invoices");
  revalidatePath("/platform");
  return { success: true as const, data: updatedSubscription };
}
