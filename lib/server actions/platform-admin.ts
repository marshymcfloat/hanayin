"use server";

import crypto from "crypto";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { z } from "zod";

import {
  addMonths,
  assignReferralAttributionOnOnboarding,
  createCheckoutForInvoice,
  createInvoiceForSubscription,
  DEFAULT_SUBSCRIPTION_PLAN_CODE,
  ensureBusinessSubscription,
  ensureDefaultPlans,
  ensureReferralCode,
  getDefaultTrialMonths,
  getPeriodEnd,
  SUBSCRIPTION_PLAN_CODES,
  getSubscriptionEnforcementMode,
  markInvoicePaid,
  qualifyAndRewardReferralForBusiness,
} from "@/features/billing/subscription-service";
import { requireAuth, requirePlatformAdmin } from "@/lib/auth/guards";
import { authOptions } from "@/lib/next auth/options";
import {
  BusinessStructure,
  CreditSource,
  OnboardingApplicationStatus,
  SubscriptionStatus,
} from "@/prisma/generated/prisma/enums";
import { prisma, supportsOnboardingApplicationModel } from "@/prisma/prisma";
import { Prisma } from "@/prisma/generated/prisma/client";
import {
  getBusinessStructureTemplate,
  normalizeBusinessStructure,
} from "@/lib/business-structure";

const createBusinessWithSubscriptionSchema = z.object({
  businessName: z.string().min(2),
  businessSlug: z.string().min(2),
  initials: z.string().min(2).max(2),
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8).optional(),
  planCode: z.enum(SUBSCRIPTION_PLAN_CODES).default(DEFAULT_SUBSCRIPTION_PLAN_CODE),
  trialMonths: z.number().int().min(1).max(12).optional(),
  referralCode: z.string().min(3).optional(),
  structure: z.nativeEnum(BusinessStructure).default(
    BusinessStructure.OWNER_EMPLOYEE_SELF_SERVICE,
  ),
  allowEmployeeSelfBooking: z.boolean().optional(),
  managerCanServe: z.boolean().optional(),
});

const updateOnboardingApplicationStatusSchema = z.object({
  applicationId: z.string().min(1),
  status: z.enum(["NEW", "CONTACTED", "APPROVED", "REJECTED", "CONVERTED"]),
  reviewNotes: z.string().max(1000).optional(),
});

const convertOnboardingApplicationSchema = z.object({
  applicationId: z.string().min(1),
  planCode: z.enum(SUBSCRIPTION_PLAN_CODES).default(DEFAULT_SUBSCRIPTION_PLAN_CODE),
  trialMonths: z.number().int().min(1).max(12).optional(),
  ownerPassword: z.string().min(8),
  structure: z.nativeEnum(BusinessStructure).optional(),
  allowEmployeeSelfBooking: z.boolean().optional(),
  managerCanServe: z.boolean().optional(),
});

const changeBusinessSubscriptionPlanSchema = z.object({
  businessId: z.string().min(1),
  planCode: z.enum(SUBSCRIPTION_PLAN_CODES),
});

const reviewSubscriptionPlanUpgradeRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
  reviewNote: z.string().trim().max(1000).optional(),
});

const markInvoicePaidManuallySchema = z.object({
  invoiceId: z.string().min(1),
  paymentReference: z.string().min(2).max(100),
  paidAt: z.string().datetime().optional(),
});

const skipOutboxMessageSchema = z.object({
  messageId: z.string().min(1),
  reason: z.string().trim().min(3).max(200).optional(),
});

async function logPlatformAction(input: {
  action: string;
  targetType: string;
  targetId: string;
  businessId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const session = await getServerSession(authOptions);
  await prisma.platformActionLog.create({
    data: {
      actor_user_id: session?.user?.id,
      actor_email: session?.user?.email ?? null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      business_id: input.businessId ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

function isCanonicalSubscriptionPlanCode(code: string) {
  return SUBSCRIPTION_PLAN_CODES.includes(code as (typeof SUBSCRIPTION_PLAN_CODES)[number]);
}

function makeOwnerPassword() {
  return crypto
    .randomBytes(12)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12);
}

function normalizeSlugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function generateUniqueBusinessSlug(name: string) {
  const base = normalizeSlugPart(name) || "business";
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? base : `${base}-${suffix}`;
    const existing = await prisma.business.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
    suffix += 1;
  }
}

function generateBusinessInitials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (letters || "SF").slice(0, 2).padEnd(2, "F");
}

export async function createBusinessWithSubscriptionAction(
  rawInput: z.input<typeof createBusinessWithSubscriptionSchema>,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const input = createBusinessWithSubscriptionSchema.parse(rawInput);
  await ensureDefaultPlans();
  const selectedPlan = await prisma.subscriptionPlan.findUnique({
    where: { code: input.planCode },
    select: { is_active: true },
  });
  if (!selectedPlan || !selectedPlan.is_active) {
    return { success: false as const, error: "Selected plan is not active" };
  }

  const ownerPassword = input.ownerPassword || makeOwnerPassword();
  const hashedPassword = await hash(ownerPassword, 12);
  const trialMonths = input.trialMonths ?? getDefaultTrialMonths();
  const structure = normalizeBusinessStructure(input.structure);
  const structureTemplate = getBusinessStructureTemplate(structure);
  const allowEmployeeSelfBooking =
    input.allowEmployeeSelfBooking ??
    structureTemplate.allowEmployeeSelfBooking;
  const managerCanServe =
    input.managerCanServe ?? structureTemplate.managerCanServe;

  const created = await prisma.$transaction(async (tx) => {
    const existingEmail = await tx.user.findUnique({
      where: { email: input.ownerEmail },
      select: { id: true },
    });
    if (existingEmail) throw new Error("Owner email already exists");

    const ownerUser = await tx.user.create({
      data: {
        email: input.ownerEmail,
        name: input.ownerName,
        hashed_password: hashedPassword,
        role: "OWNER",
      },
    });

    const business = await tx.business.create({
      data: {
        name: input.businessName,
        slug: input.businessSlug,
        initials: input.initials.toUpperCase(),
        structure,
        allow_employee_self_booking: allowEmployeeSelfBooking,
        manager_can_serve: managerCanServe,
        owners: {
          create: {
            user_id: ownerUser.id,
            specialties: [],
          },
        },
      },
    });

    return { ownerUser, business };
  });

  const subscription = await ensureBusinessSubscription(created.business.id, {
    planCode: input.planCode,
    trialMonths,
  });
  await ensureReferralCode(created.business.id);

  if (input.referralCode) {
    await assignReferralAttributionOnOnboarding(created.business.id, input.referralCode);
  }

  await logPlatformAction({
    action: "BUSINESS_CREATED_WITH_SUBSCRIPTION",
    targetType: "Business",
    targetId: created.business.id,
    businessId: created.business.id,
    metadata: {
      planCode: input.planCode,
      trialMonths,
      hasReferral: Boolean(input.referralCode),
      structure,
      allowEmployeeSelfBooking,
      managerCanServe,
    },
  });

  return {
    success: true as const,
    business: created.business,
    ownerEmail: input.ownerEmail,
    ownerPassword,
    subscriptionId: subscription.id,
  };
}

export async function grantTrialMonthsAction(businessId: string, months: number) {
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

  const nextTrialEndsAt = subscription.trial_ends_at
    ? addMonths(subscription.trial_ends_at, safeMonths)
    : addMonths(new Date(), safeMonths);
  const nextPeriodEnd = addMonths(subscription.current_period_end, safeMonths);

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

  await logPlatformAction({
    action: "TRIAL_MONTHS_GRANTED",
    targetType: "BusinessSubscription",
    targetId: updated.id,
    businessId,
    metadata: { months: safeMonths },
  });

  revalidatePath("/platform/businesses");
  return { success: true as const, data: updated };
}

export async function assignReferralOnOnboardingAction(
  newBusinessId: string,
  referralCode: string,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const attribution = await assignReferralAttributionOnOnboarding(
    newBusinessId,
    referralCode,
  );

  await logPlatformAction({
    action: "REFERRAL_ASSIGNED_ON_ONBOARDING",
    targetType: "ReferralAttribution",
    targetId: attribution.id,
    businessId: newBusinessId,
    metadata: { referralCode },
  });

  revalidatePath("/platform/referrals");
  return { success: true as const, data: attribution };
}

export async function createSubscriptionInvoiceAction(
  subscriptionId: string,
  reason = "MANUAL_ADMIN_INVOICE",
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const invoice = await createInvoiceForSubscription(subscriptionId, reason);
  await logPlatformAction({
    action: "SUBSCRIPTION_INVOICE_CREATED",
    targetType: "SubscriptionInvoice",
    targetId: invoice.id,
    businessId: invoice.business_id,
    metadata: { reason },
  });

  revalidatePath("/platform/invoices");
  return { success: true as const, data: invoice };
}

async function canAccessInvoice(invoiceId: string) {
  const platformAuth = await requirePlatformAdmin();
  if (platformAuth.success) {
    return { success: true as const, isPlatformAdmin: true };
  }

  const tenantAuth = await requireAuth();
  if (!tenantAuth.success) return tenantAuth;

  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      business: {
        select: { slug: true },
      },
    },
  });
  if (!invoice) return { success: false as const, error: "Invoice not found" };

  if (invoice.business.slug !== tenantAuth.businessSlug) {
    return { success: false as const, error: "Forbidden" };
  }

  return { success: true as const, isPlatformAdmin: false };
}

export async function createSubscriptionCheckoutAction(invoiceId: string) {
  const access = await canAccessInvoice(invoiceId);
  if (!access.success) return access;

  const checkout = await createCheckoutForInvoice(invoiceId);
  revalidatePath("/platform/invoices");

  return { success: true as const, data: checkout };
}

export async function retryInvoiceCollectionAction(invoiceId: string) {
  const access = await canAccessInvoice(invoiceId);
  if (!access.success) return access;

  await prisma.subscriptionInvoice.update({
    where: { id: invoiceId },
    data: {
      status: "OPEN",
    },
  });
  const checkout = await createCheckoutForInvoice(invoiceId);
  revalidatePath("/platform/invoices");
  return { success: true as const, data: checkout };
}

export async function applyCreditAdjustmentAction(
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

  // Credits are applied during invoice creation; this action must not mutate subscription dates/status.
  const credit = await prisma.subscriptionCreditLedger.create({
    data: {
      business_subscription_id: subscription.id,
      source: CreditSource.ADMIN_ADJUSTMENT,
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

export async function suspendBusinessAction(businessId: string, reason: string) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const subscription = await ensureBusinessSubscription(businessId);
  const updated = await prisma.businessSubscription.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.SUSPENDED,
      suspended_at: new Date(),
      grace_ends_at: null,
    },
  });

  await logPlatformAction({
    action: "BUSINESS_SUSPENDED",
    targetType: "BusinessSubscription",
    targetId: updated.id,
    businessId,
    metadata: { reason },
  });

  revalidatePath("/platform/businesses");
  return { success: true as const, data: updated };
}

export async function reactivateBusinessAction(businessId: string) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const subscription = await ensureBusinessSubscription(businessId);
  const now = new Date();
  const nextPeriodEnd = getPeriodEnd(now, subscription.plan.billing_interval);
  const updated = await prisma.businessSubscription.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      current_period_start: now,
      current_period_end: nextPeriodEnd,
      grace_ends_at: null,
      suspended_at: null,
    },
  });

  await logPlatformAction({
    action: "BUSINESS_REACTIVATED",
    targetType: "BusinessSubscription",
    targetId: updated.id,
    businessId,
  });

  revalidatePath("/platform/businesses");
  return { success: true as const, data: updated };
}

export async function changeBusinessSubscriptionPlanAction(
  businessId: string,
  planCode: z.infer<typeof changeBusinessSubscriptionPlanSchema>["planCode"],
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const input = changeBusinessSubscriptionPlanSchema.parse({ businessId, planCode });
  await ensureDefaultPlans();

  const subscription = await ensureBusinessSubscription(input.businessId);
  if (subscription.plan.code === input.planCode) {
    return { success: true as const, data: subscription };
  }

  const nextPlan = await prisma.subscriptionPlan.findUnique({
    where: { code: input.planCode },
    select: { id: true, code: true, is_active: true },
  });
  if (!nextPlan || !nextPlan.is_active) {
    return { success: false as const, error: "Selected plan is not active" };
  }

  const updated = await prisma.businessSubscription.update({
    where: { id: subscription.id },
    data: {
      plan_id: nextPlan.id,
    },
    include: {
      plan: true,
    },
  });

  await logPlatformAction({
    action: "BUSINESS_SUBSCRIPTION_PLAN_CHANGED",
    targetType: "BusinessSubscription",
    targetId: updated.id,
    businessId: input.businessId,
    metadata: {
      previousPlanCode: subscription.plan.code,
      nextPlanCode: updated.plan.code,
    },
  });

  revalidatePath("/platform/businesses");
  revalidatePath("/platform/plans");
  revalidatePath("/platform/invoices");
  return { success: true as const, data: updated };
}

export async function reviewSubscriptionPlanUpgradeRequestAction(
  rawInput: z.input<typeof reviewSubscriptionPlanUpgradeRequestSchema>,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const input = reviewSubscriptionPlanUpgradeRequestSchema.parse(rawInput);
  const request = await prisma.subscriptionPlanUpgradeRequest.findUnique({
    where: { id: input.requestId },
    include: {
      business: {
        select: {
          id: true,
          slug: true,
        },
      },
      target_plan: {
        select: {
          id: true,
          code: true,
          is_active: true,
        },
      },
      current_plan: {
        select: {
          code: true,
        },
      },
    },
  });
  if (!request) {
    return { success: false as const, error: "Upgrade request not found" };
  }
  if (request.status !== "PENDING") {
    return {
      success: false as const,
      error: "Upgrade request is already reviewed.",
    };
  }

  if (input.decision === "APPROVE") {
    if (!request.target_plan.is_active) {
      return {
        success: false as const,
        error: "Target plan is not active.",
      };
    }

    const approved = await prisma.$transaction(async (tx) => {
      const liveSubscription = await tx.businessSubscription.findUnique({
        where: { id: request.business_subscription_id },
        select: {
          id: true,
          plan_id: true,
        },
      });
      if (!liveSubscription) {
        throw new Error("Subscription not found for this upgrade request.");
      }
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
          data: {
            plan_id: request.target_plan.id,
          },
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

export async function runReferralRewardQualificationAction() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const pending = await prisma.referralAttribution.findMany({
    where: {
      status: { in: ["PENDING", "QUALIFIED"] },
    },
    select: {
      referred_business_id: true,
    },
  });

  for (const attribution of pending) {
    await qualifyAndRewardReferralForBusiness(attribution.referred_business_id);
  }

  revalidatePath("/platform/referrals");
  return { success: true as const, processed: pending.length };
}

export async function getSubscriptionEnforcementModeAction() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  return {
    success: true as const,
    mode: getSubscriptionEnforcementMode(),
  };
}

export async function updateSubscriptionPlanAction(params: {
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
  const nextIsActive = isCanonical ? params.isActive : false;

  const updated = await prisma.subscriptionPlan.update({
    where: { id: existing.id },
    data: {
      price_amount: Math.max(1, Math.round(params.priceAmount)),
      is_active: nextIsActive,
    },
  });

  await logPlatformAction({
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
  return { success: true as const, data: updated };
}

export async function updateReferralLeadStatusAction(params: {
  leadId: string;
  status: "CONTACTED" | "CONVERTED" | "REJECTED";
  convertedBusinessId?: string;
}) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const updated = await prisma.referralLead.update({
    where: { id: params.leadId },
    data: {
      status: params.status,
      converted_business_id:
        params.status === "CONVERTED" ? params.convertedBusinessId || null : null,
    },
  });

  await logPlatformAction({
    action: "REFERRAL_LEAD_STATUS_UPDATED",
    targetType: "ReferralLead",
    targetId: updated.id,
    businessId: updated.converted_business_id,
    metadata: {
      status: updated.status,
    },
  });

  revalidatePath("/platform/referrals");
  return { success: true as const, data: updated };
}

export async function rejectReferralAttributionAction(
  attributionId: string,
  reason: string,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const updated = await prisma.referralAttribution.update({
    where: { id: attributionId },
    data: {
      status: "REJECTED",
      rejected_at: new Date(),
      rejection_reason: reason,
    },
  });

  await logPlatformAction({
    action: "REFERRAL_ATTRIBUTION_REJECTED",
    targetType: "ReferralAttribution",
    targetId: updated.id,
    businessId: updated.referred_business_id,
    metadata: { reason },
  });

  revalidatePath("/platform/referrals");
  return { success: true as const, data: updated };
}

export async function updateOnboardingApplicationStatusAction(
  rawInput: z.infer<typeof updateOnboardingApplicationStatusSchema>,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  if (!supportsOnboardingApplicationModel()) {
    return {
      success: false as const,
      error: "Onboarding applications are unavailable. Restart the server.",
    };
  }

  const input = updateOnboardingApplicationStatusSchema.parse(rawInput);
  const updated = await prisma.onboardingApplication.update({
    where: { id: input.applicationId },
    data: {
      status: input.status as OnboardingApplicationStatus,
      review_notes: input.reviewNotes ?? null,
      reviewed_by_user_id: auth.session.user.id,
      reviewed_at: new Date(),
    },
  });

  await logPlatformAction({
    action: "ONBOARDING_APPLICATION_STATUS_UPDATED",
    targetType: "OnboardingApplication",
    targetId: updated.id,
    metadata: {
      status: updated.status,
      hasReviewNotes: Boolean(updated.review_notes),
    },
  });

  revalidatePath("/platform/applications");
  return { success: true as const, data: updated };
}

export async function convertOnboardingApplicationToBusinessAction(
  rawInput: z.input<typeof convertOnboardingApplicationSchema>,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  if (!supportsOnboardingApplicationModel()) {
    return {
      success: false as const,
      error: "Onboarding applications are unavailable. Restart the server.",
    };
  }

  const input = convertOnboardingApplicationSchema.parse(rawInput);
  const application = await prisma.onboardingApplication.findUnique({
    where: { id: input.applicationId },
    include: {
      referral_code: {
        select: { code: true, is_active: true },
      },
    },
  });
  if (!application) {
    return { success: false as const, error: "Onboarding application not found" };
  }
  if (application.converted_business_id) {
    return {
      success: false as const,
      error: "Application already converted",
    };
  }

  const businessSlug = await generateUniqueBusinessSlug(application.business_name);
  const initials = generateBusinessInitials(application.business_name);
  const referralCode =
    application.referral_code?.is_active && application.referral_code.code
      ? application.referral_code.code
      : undefined;
  const structure = normalizeBusinessStructure(
    input.structure ?? application.requested_structure,
  );
  const structureTemplate = getBusinessStructureTemplate(structure);
  const allowEmployeeSelfBooking =
    input.allowEmployeeSelfBooking ??
    application.requested_allow_employee_self_booking ??
    structureTemplate.allowEmployeeSelfBooking;
  const managerCanServe =
    input.managerCanServe ??
    application.requested_manager_can_serve ??
    structureTemplate.managerCanServe;

  const creation = await createBusinessWithSubscriptionAction({
    businessName: application.business_name,
    businessSlug,
    initials,
    ownerName: application.owner_name,
    ownerEmail: application.owner_email,
    ownerPassword: input.ownerPassword,
    planCode: input.planCode,
    trialMonths: input.trialMonths,
    referralCode,
    structure,
    allowEmployeeSelfBooking,
    managerCanServe,
  });

  if (!creation.success) {
    return creation;
  }

  const updated = await prisma.onboardingApplication.update({
    where: { id: application.id },
    data: {
      status: OnboardingApplicationStatus.CONVERTED,
      converted_business_id: creation.business.id,
      reviewed_by_user_id: auth.session.user.id,
      reviewed_at: new Date(),
      review_notes: application.review_notes ?? "Converted to business",
    },
  });

  await logPlatformAction({
    action: "ONBOARDING_APPLICATION_CONVERTED",
    targetType: "OnboardingApplication",
    targetId: updated.id,
    businessId: creation.business.id,
    metadata: {
      businessId: creation.business.id,
      businessSlug: creation.business.slug,
      planCode: input.planCode,
      structure,
      allowEmployeeSelfBooking,
      managerCanServe,
    },
  });

  revalidatePath("/platform/applications");
  revalidatePath("/platform/businesses");
  return {
    success: true as const,
    data: {
      application: updated,
      business: creation.business,
      ownerEmail: creation.ownerEmail,
      ownerPassword: creation.ownerPassword,
    },
  };
}

export async function markInvoicePaidManuallyAction(
  rawInput: z.infer<typeof markInvoicePaidManuallySchema>,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const input = markInvoicePaidManuallySchema.parse(rawInput);
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: input.invoiceId },
    select: {
      id: true,
      status: true,
      amount_due: true,
      amount_paid: true,
      business_id: true,
      metadata: true,
    },
  });
  if (!invoice) {
    return { success: false as const, error: "Invoice not found" };
  }

  const settledAmount =
    invoice.amount_due > 0 ? invoice.amount_due : Math.max(1, invoice.amount_paid);
  await markInvoicePaid({
    invoiceId: invoice.id,
    paidAmountCentavos: settledAmount,
  });

  const parsedPaidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(parsedPaidAt.getTime())) {
    return { success: false as const, error: "Invalid paid date" };
  }

  const existingMetadata =
    invoice.metadata && typeof invoice.metadata === "object" && !Array.isArray(invoice.metadata)
      ? (invoice.metadata as Record<string, unknown>)
      : {};

  const updated = await prisma.subscriptionInvoice.update({
    where: { id: invoice.id },
    data: {
      paid_at: parsedPaidAt,
      metadata: {
        ...existingMetadata,
        collection_mode: "MANUAL",
        payment_reference: input.paymentReference,
        marked_by_admin: auth.session.user.id,
        marked_at: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  await qualifyAndRewardReferralForBusiness(invoice.business_id);

  await logPlatformAction({
    action: "SUBSCRIPTION_INVOICE_MARKED_PAID_MANUALLY",
    targetType: "SubscriptionInvoice",
    targetId: updated.id,
    businessId: invoice.business_id,
    metadata: {
      paymentReference: input.paymentReference,
      paidAmountCentavos: settledAmount,
      paidAt: parsedPaidAt.toISOString(),
    },
  });

  revalidatePath("/platform/invoices");
  revalidatePath("/platform/referrals");
  return { success: true as const, data: updated };
}

export async function retryOutboxMessageAction(messageId: string) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const message = await prisma.outboxMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      processed: true,
      processed_at: true,
      attempts: true,
      last_error: true,
      event_type: true,
      business_id: true,
    },
  });

  if (!message) {
    return { success: false as const, error: "Outbox message not found" };
  }

  if (message.processed && !message.last_error && message.attempts === 0) {
    return {
      success: false as const,
      error: "Processed message without failures cannot be retried.",
    };
  }

  const updated = await prisma.outboxMessage.update({
    where: { id: message.id },
    data: {
      processed: false,
      processed_at: null,
      attempts: 0,
      last_error: null,
    },
  });

  await logPlatformAction({
    action: "OUTBOX_MESSAGE_RETRY_REQUESTED",
    targetType: "OutboxMessage",
    targetId: updated.id,
    businessId: updated.business_id,
    metadata: {
      eventType: updated.event_type,
      previousAttempts: message.attempts,
      hadError: Boolean(message.last_error),
    },
  });

  revalidatePath("/platform/outbox");
  revalidatePath("/platform");
  return { success: true as const, data: updated };
}

export async function skipOutboxMessageAction(
  rawInput: z.infer<typeof skipOutboxMessageSchema>,
) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const input = skipOutboxMessageSchema.parse(rawInput);
  const message = await prisma.outboxMessage.findUnique({
    where: { id: input.messageId },
    select: {
      id: true,
      processed: true,
      attempts: true,
      last_error: true,
      event_type: true,
      business_id: true,
    },
  });
  if (!message) {
    return { success: false as const, error: "Outbox message not found" };
  }

  if (message.processed && !message.last_error) {
    return {
      success: false as const,
      error: "Message is already processed successfully.",
    };
  }

  const reason = input.reason?.trim() || "Skipped by platform admin";
  const skipError = message.last_error
    ? `[SKIPPED_BY_ADMIN] ${reason} | previous_error=${message.last_error}`
    : `[SKIPPED_BY_ADMIN] ${reason}`;

  const updated = await prisma.outboxMessage.update({
    where: { id: message.id },
    data: {
      processed: true,
      processed_at: new Date(),
      attempts: { increment: 1 },
      last_error: skipError,
    },
  });

  await logPlatformAction({
    action: "OUTBOX_MESSAGE_SKIPPED",
    targetType: "OutboxMessage",
    targetId: updated.id,
    businessId: updated.business_id,
    metadata: {
      eventType: updated.event_type,
      reason,
      previousAttempts: message.attempts,
    },
  });

  revalidatePath("/platform/outbox");
  revalidatePath("/platform");
  return { success: true as const, data: updated };
}
