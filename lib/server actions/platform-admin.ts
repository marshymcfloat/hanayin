"use server";

import crypto from "crypto";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { z } from "zod";

import {
  addMonths,
  assignReferralAttributionOnOnboarding,
  createInvoiceForSubscription,
  DEFAULT_SUBSCRIPTION_PLAN_CODE,
  ensureBusinessSubscription,
  ensureDefaultPlans,
  ensureReferralCode,
  getDefaultTrialMonths,
  getPeriodEnd,
  MANUAL_COLLECTION_MODE_ERROR,
  SUBSCRIPTION_PLAN_CODES,
  getSubscriptionEnforcementMode,
  markInvoicePaid,
  qualifyAndRewardReferralForBusiness,
} from "@/features/billing/subscription-service";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { authOptions } from "@/lib/next auth/options";
import {
  normalizePhilippinePhone,
  sendSemaphoreMagicLink,
} from "@/lib/services/sms-otp";
import {
  createOnboardingLoginToken,
  ONBOARDING_LOGIN_TOKEN_TTL_SECONDS_DEFAULT,
} from "@/lib/security/onboarding-login-token";
import { logger } from "@/lib/logger";
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
import {
  seedDemoBusiness,
  clearDemoBusinessData,
} from "@/features/demo-trial/seed-demo-business";

const createBusinessWithSubscriptionSchema = z.object({
  businessName: z.string().min(2),
  businessSlug: z.string().min(2),
  initials: z.string().min(2).max(2),
  ownerName: z.string().min(2),
  ownerContactNumber: z.string().trim().min(7).max(20),
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
  // When true (default) the new business is populated with sample services,
  // hours, customers, and bookings so the trial owner lands on a working
  // dashboard. Can be disabled per-conversion if the admin is hand-curating.
  seedDemoData: z.boolean().default(true),
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
  // Prisma 7's checked CreateInput type doesn't accept scalar FK fields when
  // a relation is defined — must use nested-relation form. Switching to
  // `actor_user: { connect }` / `business: { connect }` keeps type safety
  // without resorting to the Unchecked* variants.
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

  const normalizedOwnerContact = normalizePhilippinePhone(
    input.ownerContactNumber,
  );
  if (!/^63\d{10}$/.test(normalizedOwnerContact)) {
    return {
      success: false as const,
      error: "Invalid owner contact number",
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const existingContact = await tx.user.findUnique({
      where: { contact_number: normalizedOwnerContact },
      select: { id: true },
    });
    if (existingContact) throw new Error("Owner contact number already exists");

    const ownerUser = await tx.user.create({
      data: {
        contact_number: normalizedOwnerContact,
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
    ownerUserId: created.ownerUser.id,
    ownerContactNumber: normalizedOwnerContact,
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

  // Extend from "now" if the existing trial already lapsed, otherwise from
  // the existing trial end. Without this, granting +1mo to a trial that
  // expired 10 days ago produced a "new" trial end that was still in the past.
  const now = new Date();
  const trialAnchor =
    subscription.trial_ends_at && subscription.trial_ends_at > now
      ? subscription.trial_ends_at
      : now;
  const periodAnchor =
    subscription.current_period_end > now ? subscription.current_period_end : now;
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

  await logPlatformAction({
    action: "TRIAL_MONTHS_GRANTED",
    targetType: "BusinessSubscription",
    targetId: updated.id,
    businessId,
    metadata: { months: safeMonths },
  });

  revalidatePath("/platform/businesses");
  // Trial counts surface on the overview KPIs; without this they go stale.
  revalidatePath("/platform");
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

export async function createSubscriptionCheckoutAction(_invoiceId: string) {
  return { success: false as const, error: MANUAL_COLLECTION_MODE_ERROR };
}

export async function retryInvoiceCollectionAction(_invoiceId: string) {
  return { success: false as const, error: MANUAL_COLLECTION_MODE_ERROR };
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

  // Reactivate is meaningful only for paused/expired subscriptions. Calling it
  // on TRIALING wipes remaining trial time; calling it on ACTIVE silently
  // resets the billing clock and forgives any pending invoices. Both are
  // surprising-to-the-admin actions and we now refuse them explicitly.
  if (
    subscription.status !== SubscriptionStatus.SUSPENDED &&
    subscription.status !== SubscriptionStatus.GRACE_PERIOD &&
    subscription.status !== SubscriptionStatus.CANCELED
  ) {
    return {
      success: false as const,
      error: `Cannot reactivate a subscription in status ${subscription.status}.`,
    };
  }

  // Defense against forgiving unpaid invoices on a SUSPENDED subscription.
  // Reactivating reopens billing — admin must consciously settle or void any
  // OPEN/FAILED invoices first (manual mark-paid on /platform/invoices).
  if (subscription.status === SubscriptionStatus.SUSPENDED) {
    const unpaidCount = await prisma.subscriptionInvoice.count({
      where: {
        business_subscription_id: subscription.id,
        status: { in: ["OPEN", "FAILED"] },
      },
    });
    if (unpaidCount > 0) {
      return {
        success: false as const,
        error: `Cannot reactivate while ${unpaidCount} unpaid invoice(s) exist. Settle or void them first.`,
      };
    }
  }

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
      // Trial is over once we move to ACTIVE — clear it so /apply/status and
      // dashboards don't show a stale trial countdown.
      trial_ends_at: null,
    },
  });

  await logPlatformAction({
    action: "BUSINESS_REACTIVATED",
    targetType: "BusinessSubscription",
    targetId: updated.id,
    businessId,
    metadata: { fromStatus: subscription.status },
  });

  revalidatePath("/platform/businesses");
  revalidatePath("/platform");
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
    select: { id: true, code: true, is_active: true, billing_interval: true },
  });
  if (!nextPlan || !nextPlan.is_active) {
    return { success: false as const, error: "Selected plan is not active" };
  }

  // For ACTIVE subscriptions, swapping plan_id alone gave the customer the
  // higher-tier features at the old plan's invoiced price until the natural
  // renewal — a silent revenue leak. Reset the period to "now" so the next
  // renewal cron mints an invoice at the new plan's price. Trialing
  // subscriptions keep their trial window (admin is just choosing what plan
  // they trial on).
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
    data: {
      plan_id: nextPlan.id,
      ...periodReset,
    },
    include: { plan: true },
  });

  // Mint an invoice for the new plan immediately on ACTIVE → admin can see
  // the price impact and the customer's next charge is correct.
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

  // De-dup: a single business can have multiple attributions; the qualifier is
  // idempotent per business so calling it once per unique id is enough.
  const uniqueBusinessIds = Array.from(
    new Set(pending.map((p) => p.referred_business_id)),
  );

  // Bounded concurrency: Prisma has a connection-pool limit, and
  // qualifyAndRewardReferralForBusiness fans out internally. 8 in flight is a
  // pragmatic compromise between throughput and pool pressure.
  const CONCURRENCY = 8;
  let cursor = 0;
  let failures = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, uniqueBusinessIds.length) }).map(
      async () => {
        while (cursor < uniqueBusinessIds.length) {
          const idx = cursor++;
          const businessId = uniqueBusinessIds[idx];
          try {
            await qualifyAndRewardReferralForBusiness(businessId);
          } catch (error) {
            failures++;
            logger.warn("[ReferralQualification] business failed", {
              businessId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      },
    ),
  );

  revalidatePath("/platform/referrals");
  return {
    success: true as const,
    processed: uniqueBusinessIds.length,
    failures,
  };
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
  // Plan prices appear on /platform/businesses (assisted-onboarding form) and
  // /platform/applications (convert dialog default-plan price). Stale prices
  // there mean admins quote the wrong amount on a fresh trial.
  revalidatePath("/platform/businesses");
  revalidatePath("/platform/applications");
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

  // Only stamp reviewer identity on terminal transitions. Marking an app
  // CONTACTED is a triage signal that any admin may set repeatedly; if we
  // overwrote `reviewed_by_user_id` here, the original reviewer's identity
  // would silently disappear when a different admin re-confirms contact.
  const stampReviewer =
    input.status === "APPROVED" || input.status === "REJECTED";

  const updated = await prisma.onboardingApplication.update({
    where: { id: input.applicationId },
    data: {
      status: input.status as OnboardingApplicationStatus,
      review_notes: input.reviewNotes ?? null,
      ...(stampReviewer
        ? {
            reviewed_by_user_id: auth.session.user.id,
            reviewed_at: new Date(),
          }
        : {}),
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
  // Rejected applications shouldn't be convertible. If an admin actually
  // wants to provision one, they should re-open it (mark NEW or CONTACTED)
  // first — that's an explicit decision worth recording.
  if (application.status === OnboardingApplicationStatus.REJECTED) {
    return {
      success: false as const,
      error:
        "Application is REJECTED. Re-open it (mark NEW or CONTACTED) before converting.",
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

  if (!application.owner_phone) {
    return {
      success: false as const,
      error:
        "Application is missing the owner contact number. Ask the applicant to provide one before converting.",
    };
  }

  const creation = await createBusinessWithSubscriptionAction({
    businessName: application.business_name,
    businessSlug,
    initials,
    ownerName: application.owner_name,
    ownerContactNumber: application.owner_phone,
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

  // Compensating delete: if linking the application to the new business fails
  // (DB hiccup, race), tear the business back down so we don't end up with an
  // orphaned business + user pair that the application has no record of.
  // Cascade FKs handle owner/subscription/referral-code cleanup.
  let updated;
  try {
    updated = await prisma.onboardingApplication.update({
      where: { id: application.id },
      data: {
        status: OnboardingApplicationStatus.CONVERTED,
        converted_business_id: creation.business.id,
        reviewed_by_user_id: auth.session.user.id,
        reviewed_at: new Date(),
        review_notes: application.review_notes ?? "Converted to business",
      },
    });
  } catch (error) {
    logger.error("[OnboardingConversion] application link failed; rolling back business", {
      applicationId: application.id,
      businessId: creation.business.id,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      await prisma.business.delete({ where: { id: creation.business.id } });
      await prisma.user.delete({ where: { id: creation.ownerUserId } });
    } catch (rollbackError) {
      logger.error("[OnboardingConversion] rollback failed; manual cleanup required", {
        businessId: creation.business.id,
        ownerUserId: creation.ownerUserId,
        rollbackError:
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }
    return {
      success: false as const,
      error: "Failed to link application to new business; conversion rolled back. Try again.",
    };
  }

  // Demo-data seeding: best-effort. If it fails the conversion is still a
  // success — the business is real, the magic link still works, the owner
  // just lands on an empty dashboard. We log loudly so platform admins can
  // see and re-run the seeder manually if needed.
  let demoSeed: Awaited<ReturnType<typeof seedDemoBusiness>> | null = null;
  if (input.seedDemoData) {
    try {
      demoSeed = await seedDemoBusiness(creation.business.id);
    } catch (error) {
      logger.error("[OnboardingConversion] demo seed failed", {
        businessId: creation.business.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

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
      demoSeed,
    },
  });

  // Mint a magic-link token + SMS the new owner so they can sign in
  // without the admin having to share a password through any external
  // channel. Phone-first product, so SMS is the primary delivery path;
  // email path is intentionally not duplicated here (the applicant's
  // existing tokenized status page is the email-equivalent fallback —
  // it'll show the same magic link from their original ack email).
  const magicToken = createOnboardingLoginToken({
    userId: creation.ownerUserId,
    applicationId: application.id,
  });
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "";
  const magicLink = `${baseUrl}/login/magic?token=${encodeURIComponent(
    magicToken,
  )}&slug=${encodeURIComponent(creation.business.slug)}`;

  let smsResult: { success: boolean; error?: string } | null = null;
  if (application.owner_phone) {
    smsResult = await sendSemaphoreMagicLink(
      application.owner_phone,
      magicLink,
    );
    if (!smsResult.success) {
      logger.warn("[OnboardingConversion] Magic-link SMS failed", {
        applicationId: application.id,
        reason: smsResult.error,
      });
    }
  }

  revalidatePath("/platform/applications");
  revalidatePath("/platform/businesses");
  revalidatePath(`/apply/status`);
  return {
    success: true as const,
    data: {
      application: updated,
      business: creation.business,
      ownerContactNumber: creation.ownerContactNumber,
      // Plaintext password is still returned so the admin has a manual
      // fallback if the SMS fails AND the applicant doesn't have access
      // to the status page. Only shown in the conversion-success modal,
      // never persisted in any log or metadata.
      ownerPassword: creation.ownerPassword,
      magicLink,
      magicLinkExpiresInSeconds: ONBOARDING_LOGIN_TOKEN_TTL_SECONDS_DEFAULT,
      smsDelivery: smsResult
        ? smsResult.success
          ? ("sent" as const)
          : ("failed" as const)
        : ("skipped" as const),
    },
  };
}

/**
 * Re-send the post-conversion magic-link SMS to a business's owner.
 *
 * Useful when the original SMS bounced, the applicant lost the link, or the
 * 1-hour window expired before they could redeem. Mints a fresh single-use
 * token and (if a phone is on file) ships it via Semaphore.
 *
 * Looks up the OnboardingApplication first so the magic-link is bound to
 * the same applicationId the original conversion used (consistent audit
 * trail). Falls back to "no application" mode for businesses created via
 * the assisted-onboarding form rather than /apply.
 */
export async function resendMagicLinkAction(businessId: string) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      slug: true,
      owners: {
        take: 1,
        select: {
          user_id: true,
          user: { select: { contact_number: true, name: true } },
        },
      },
    },
  });
  if (!business) {
    return { success: false as const, error: "Business not found" };
  }
  const owner = business.owners[0];
  if (!owner?.user_id) {
    return { success: false as const, error: "Business has no owner record" };
  }

  // Best-effort lookup of the originating application. Not all businesses
  // have one (assisted-onboarding form skips /apply entirely).
  const application = supportsOnboardingApplicationModel()
    ? await prisma.onboardingApplication.findFirst({
        where: { converted_business_id: businessId },
        select: { id: true },
      })
    : null;

  const magicToken = createOnboardingLoginToken({
    userId: owner.user_id,
    applicationId: application?.id ?? `business:${business.id}`,
  });
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "";
  const magicLink = `${baseUrl}/login/magic?token=${encodeURIComponent(
    magicToken,
  )}&slug=${encodeURIComponent(business.slug)}`;

  let smsResult: { success: boolean; error?: string } | null = null;
  if (owner.user.contact_number) {
    smsResult = await sendSemaphoreMagicLink(
      owner.user.contact_number,
      magicLink,
    );
    if (!smsResult.success) {
      logger.warn("[ResendMagicLink] SMS failed", {
        businessId,
        reason: smsResult.error,
      });
    }
  }

  await logPlatformAction({
    action: "MAGIC_LINK_RESENT",
    targetType: "Business",
    targetId: business.id,
    businessId,
    metadata: {
      smsDelivery: smsResult
        ? smsResult.success
          ? "sent"
          : "failed"
        : "skipped",
    },
  });

  return {
    success: true as const,
    data: {
      magicLink,
      magicLinkExpiresInSeconds: ONBOARDING_LOGIN_TOKEN_TTL_SECONDS_DEFAULT,
      smsDelivery: smsResult
        ? smsResult.success
          ? ("sent" as const)
          : ("failed" as const)
        : ("skipped" as const),
    },
  };
}

/**
 * Mint a single-use sign-in link as the business owner so a platform admin
 * can preview the trial dashboard from the inside without password-sharing.
 *
 * Returns the magic link to the admin dialog — does NOT auto-redirect or
 * mint a session here. Every use is audit-logged with the actor admin id.
 */
export async function impersonateBusinessOwnerAction(businessId: string) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      slug: true,
      name: true,
      owners: {
        take: 1,
        select: { user_id: true },
      },
    },
  });
  if (!business) {
    return { success: false as const, error: "Business not found" };
  }
  const ownerUserId = business.owners[0]?.user_id;
  if (!ownerUserId) {
    return { success: false as const, error: "Business has no owner record" };
  }

  // Short TTL — preview is meant to be ad-hoc, not a long-lived backdoor.
  // 15 minutes lets the admin click around and dismiss the dialog before the
  // token expires; a fresh impersonation always mints a new jti.
  const TTL_SECONDS = 15 * 60;
  const magicToken = createOnboardingLoginToken({
    userId: ownerUserId,
    applicationId: `impersonate:${auth.session.user.id}:${business.id}`,
    ttlSeconds: TTL_SECONDS,
  });
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "";
  const magicLink = `${baseUrl}/login/magic?token=${encodeURIComponent(
    magicToken,
  )}&slug=${encodeURIComponent(business.slug)}`;

  await logPlatformAction({
    action: "BUSINESS_OWNER_IMPERSONATED",
    targetType: "Business",
    targetId: business.id,
    businessId,
    metadata: {
      ownerUserId,
      ttlSeconds: TTL_SECONDS,
    },
  });

  return {
    success: true as const,
    data: {
      magicLink,
      expiresInSeconds: TTL_SECONDS,
      businessName: business.name,
    },
  };
}

/**
 * Convert a TRIALING subscription into a paying ACTIVE one in a single step.
 *
 * Without this the workflow takes 3 manual page hops: change plan (no-op
 * since the trial already had a plan), create invoice from /platform/invoices,
 * mark it paid. We collapse those into one atomic action and require a
 * payment reference (transfer ref, manual receipt id) so the audit trail
 * captures how the money actually arrived.
 */
export async function convertTrialToPaidAction(input: {
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

  // Flip subscription to ACTIVE first so the invoice we mint targets the
  // post-trial period (subscription-service uses period dates to size the
  // amount). Then create the invoice and immediately mark it paid against
  // the admin's reference.
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
      invoice.amount_due > 0 ? invoice.amount_due : Math.max(1, invoice.amount_paid),
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

/**
 * Wipe demo content (services/customers/employees/bookings flagged is_demo)
 * from a business. Owner-facing "go live" action — surfaced from
 * /platform/businesses for now while the trial owner doesn't have a button
 * of their own.
 */
export async function clearDemoDataAction(businessId: string) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  await clearDemoBusinessData(businessId);

  await logPlatformAction({
    action: "DEMO_DATA_CLEARED",
    targetType: "Business",
    targetId: businessId,
    businessId,
  });

  revalidatePath("/platform/businesses");
  return { success: true as const };
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
  // Overview shows revenue / paid-invoice counts; without this they go stale.
  revalidatePath("/platform");
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
