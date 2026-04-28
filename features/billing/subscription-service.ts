import { getCurrentDateTimePH } from "@/lib/date-utils";
import { BillingInterval, CreditSource, InvoiceStatus, LeadStatus, ReferralStatus, SubscriptionStatus } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export const SUBSCRIPTION_READ_ONLY_ERROR = "SUBSCRIPTION_READ_ONLY";
export const MANUAL_COLLECTION_MODE_ERROR = "MANUAL_COLLECTION_MODE";
const PHP_CURRENCY = "PHP";
const REFERRAL_REWARD_CAP_MONTHS = 6;
const LEGACY_PRO_ANNUAL_PLAN_CODE = "PRO_ANNUAL";

export const SUBSCRIPTION_PLAN_CODES = [
  "STARTER_MONTHLY",
  "PLUS_MONTHLY",
  "PRO_MONTHLY",
] as const;
export type SubscriptionPlanCode = (typeof SUBSCRIPTION_PLAN_CODES)[number];
export const DEFAULT_SUBSCRIPTION_PLAN_CODE: SubscriptionPlanCode =
  "STARTER_MONTHLY";

export type SubscriptionEnforcementMode = "OFF" | "WARN_ONLY" | "ON";

export function getSubscriptionEnforcementMode(): SubscriptionEnforcementMode {
  const mode = process.env.SUBSCRIPTION_ENFORCEMENT_MODE ?? "OFF";
  if (mode === "ON" || mode === "WARN_ONLY") return mode;
  return "OFF";
}

export function getBillingCollectionMode() {
  return "MANUAL_ONLY" as const;
}

export function isManualCollectionOnly() {
  return true;
}

export function getDefaultTrialMonths() {
  const raw = Number.parseInt(process.env.DEFAULT_TRIAL_MONTHS ?? "1", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return raw;
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

export function getPeriodEnd(start: Date, interval: BillingInterval) {
  return interval === BillingInterval.YEARLY ? addYears(start, 1) : addMonths(start, 1);
}

export type TenantAccessState =
  | {
      exists: false;
      readOnly: true;
      reason: "BUSINESS_NOT_FOUND";
      mode: SubscriptionEnforcementMode;
    }
  | {
      exists: true;
      businessId: string;
      businessSlug: string;
      subscription: {
        id: string;
        status: SubscriptionStatus;
        trial_ends_at: Date | null;
        grace_ends_at: Date | null;
        current_period_end: Date;
      } | null;
      readOnly: boolean;
      reason: string | null;
      mode: SubscriptionEnforcementMode;
    };

export async function getTenantAccessState(businessSlug: string): Promise<TenantAccessState> {
  const mode = getSubscriptionEnforcementMode();
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: {
      id: true,
      slug: true,
      subscriptions: {
        select: {
          id: true,
          status: true,
          trial_ends_at: true,
          grace_ends_at: true,
          current_period_end: true,
        },
      },
    },
  });

  if (!business) {
    return { exists: false, readOnly: true, reason: "BUSINESS_NOT_FOUND", mode };
  }

  const subscription = business.subscriptions[0] ?? null;
  if (!subscription) {
    const missingReadOnly = mode === "ON";
    return {
      exists: true,
      businessId: business.id,
      businessSlug: business.slug,
      subscription: null,
      readOnly: missingReadOnly,
      reason: missingReadOnly ? "MISSING_SUBSCRIPTION" : null,
      mode,
    };
  }

  const now = getCurrentDateTimePH();
  const isSuspended = subscription.status === SubscriptionStatus.SUSPENDED;
  const isCanceled = subscription.status === SubscriptionStatus.CANCELED;
  const pastGrace =
    subscription.status === SubscriptionStatus.GRACE_PERIOD &&
    subscription.grace_ends_at !== null &&
    subscription.grace_ends_at <= now;

  const readOnly = mode === "ON" && (isSuspended || isCanceled || pastGrace);
  const reason = readOnly ? SUBSCRIPTION_READ_ONLY_ERROR : null;

  return {
    exists: true,
    businessId: business.id,
    businessSlug: business.slug,
    subscription,
    readOnly,
    reason,
    mode,
  };
}

export async function ensureDefaultPlans() {
  const catalog: Array<{
    code: SubscriptionPlanCode;
    name: string;
    description: string;
    priceAmount: number;
  }> = [
    {
      code: "STARTER_MONTHLY",
      name: "Starter Monthly",
      description: "ServiceFlow Starter monthly subscription",
      priceAmount: 149_900,
    },
    {
      code: "PLUS_MONTHLY",
      name: "Plus Monthly",
      description: "ServiceFlow Plus monthly subscription",
      priceAmount: 249_900,
    },
    {
      code: "PRO_MONTHLY",
      name: "Pro Monthly",
      description: "ServiceFlow Pro monthly subscription",
      priceAmount: 399_900,
    },
  ];

  await prisma.$transaction([
    ...catalog.map((plan) =>
      prisma.subscriptionPlan.upsert({
        where: { code: plan.code },
        create: {
          code: plan.code,
          name: plan.name,
          description: plan.description,
          billing_interval: BillingInterval.MONTHLY,
          price_amount: plan.priceAmount,
          currency: PHP_CURRENCY,
          is_active: true,
        },
        update: {
          name: plan.name,
          description: plan.description,
          billing_interval: BillingInterval.MONTHLY,
          price_amount: plan.priceAmount,
          currency: PHP_CURRENCY,
          // Keep platform-admin availability toggles for existing plans.
        },
      }),
    ),
    // Keep legacy annual plan rows for backwards compatibility, but disable for new assignments.
    prisma.subscriptionPlan.updateMany({
      where: { code: LEGACY_PRO_ANNUAL_PLAN_CODE },
      data: { is_active: false },
    }),
  ]);
}

export async function ensureBusinessSubscription(
  businessId: string,
  opts?: { planCode?: SubscriptionPlanCode; trialMonths?: number },
) {
  const existing = await prisma.businessSubscription.findUnique({
    where: { business_id: businessId },
    include: {
      plan: true,
    },
  });
  if (existing) return existing;

  const planCode = opts?.planCode ?? DEFAULT_SUBSCRIPTION_PLAN_CODE;
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { code: planCode },
  });
  if (!plan) {
    throw new Error("Default subscription plan not found");
  }

  const now = getCurrentDateTimePH();
  const trialMonths = opts?.trialMonths ?? getDefaultTrialMonths();
  const trialEndsAt = addMonths(now, trialMonths);
  const periodEnd = getPeriodEnd(now, plan.billing_interval);

  return prisma.businessSubscription.create({
    data: {
      business_id: businessId,
      plan_id: plan.id,
      status: SubscriptionStatus.TRIALING,
      collection_method: "MANUAL_CHECKOUT",
      current_period_start: now,
      current_period_end: periodEnd,
      trial_ends_at: trialEndsAt,
    },
    include: {
      plan: true,
    },
  });
}

export async function ensureReferralCode(businessId: string) {
  const existing = await prisma.referralCode.findUnique({
    where: { business_id: businessId },
  });
  if (existing) return existing;

  const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const code = `SF-${randomSuffix}`;
  return prisma.referralCode.create({
    data: {
      business_id: businessId,
      code,
      is_active: true,
    },
  });
}

function convertCentavosToAmount(centavos: number) {
  return centavos / 100;
}

export async function createInvoiceForSubscription(subscriptionId: string, reason = "RENEWAL") {
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.businessSubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        plan: true,
        credits: {
          where: {
            amount_remaining: { gt: 0 },
          },
          orderBy: { created_at: "asc" },
        },
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const existingOpen = await tx.subscriptionInvoice.findFirst({
      where: {
        business_subscription_id: subscription.id,
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
        status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.OPEN] },
      },
    });
    if (existingOpen) return existingOpen;

    const now = getCurrentDateTimePH();
    let creditToApply = 0;
    let remainingSubtotal = subscription.plan.price_amount;

    for (const credit of subscription.credits) {
      if (credit.expires_at && credit.expires_at < now) {
        continue;
      }
      if (remainingSubtotal <= 0) break;
      const usable = Math.min(remainingSubtotal, credit.amount_remaining);
      if (usable <= 0) continue;
      creditToApply += usable;
      remainingSubtotal -= usable;

      await tx.subscriptionCreditLedger.update({
        where: { id: credit.id },
        data: {
          amount_remaining: credit.amount_remaining - usable,
        },
      });
    }

    const amountDue = Math.max(0, subscription.plan.price_amount - creditToApply);
    const invoice = await tx.subscriptionInvoice.create({
      data: {
        business_subscription_id: subscription.id,
        business_id: subscription.business_id,
        plan_id: subscription.plan.id,
        status: amountDue === 0 ? InvoiceStatus.PAID : InvoiceStatus.OPEN,
        currency: PHP_CURRENCY,
        reason,
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
        due_at: now,
        amount_subtotal: subscription.plan.price_amount,
        amount_credit_applied: creditToApply,
        amount_due: amountDue,
        amount_paid: amountDue === 0 ? 0 : 0,
        paid_at: amountDue === 0 ? now : null,
      },
    });

    if (amountDue === 0) {
      const nextStart = subscription.current_period_end;
      const nextEnd = getPeriodEnd(nextStart, subscription.plan.billing_interval);
      await tx.businessSubscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          grace_ends_at: null,
          suspended_at: null,
          current_period_start: nextStart,
          current_period_end: nextEnd,
        },
      });
    }

    return invoice;
  });
}

export async function markInvoicePaid(params: {
  invoiceId: string;
  paidAmountCentavos: number;
}) {
  const { invoiceId, paidAmountCentavos } = params;
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        business_subscription: {
          include: {
            plan: true,
          },
        },
      },
    });
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === InvoiceStatus.PAID) return invoice;
    const settledAmount =
      paidAmountCentavos > 0 ? paidAmountCentavos : invoice.amount_due;

    const now = getCurrentDateTimePH();
    await tx.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.PAID,
        amount_paid: settledAmount,
        paid_at: now,
      },
    });

    const nextStart = invoice.period_end;
    const nextEnd = getPeriodEnd(nextStart, invoice.business_subscription.plan.billing_interval);
    await tx.businessSubscription.update({
      where: { id: invoice.business_subscription_id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        grace_ends_at: null,
        suspended_at: null,
        current_period_start: nextStart,
        current_period_end: nextEnd,
      },
    });

    return invoice;
  });
}

export async function moveDueSubscriptionsToGracePeriod() {
  const now = getCurrentDateTimePH();
  const dueSubscriptions = await prisma.businessSubscription.findMany({
    where: {
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      current_period_end: { lte: now },
    },
  });

  for (const subscription of dueSubscriptions) {
    await prisma.businessSubscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.GRACE_PERIOD,
        grace_ends_at: addDays(now, 7),
      },
    });
  }

  return dueSubscriptions.length;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function suspendExpiredGraceSubscriptions() {
  const now = getCurrentDateTimePH();
  const expired = await prisma.businessSubscription.findMany({
    where: {
      status: SubscriptionStatus.GRACE_PERIOD,
      grace_ends_at: { lte: now },
    },
    select: { id: true },
  });

  if (expired.length === 0) return 0;

  await prisma.businessSubscription.updateMany({
    where: {
      id: { in: expired.map((item) => item.id) },
    },
    data: {
      status: SubscriptionStatus.SUSPENDED,
      suspended_at: now,
    },
  });

  return expired.length;
}

export async function createReferralLead(params: {
  code: string;
  referredBusinessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  notes?: string;
}) {
  const code = await prisma.referralCode.findUnique({
    where: { code: params.code.toUpperCase() },
  });
  if (!code || !code.is_active) throw new Error("Invalid referral code");

  return prisma.referralLead.create({
    data: {
      referral_code_id: code.id,
      referred_business_name: params.referredBusinessName,
      owner_name: params.ownerName,
      owner_email: params.ownerEmail,
      owner_phone: params.ownerPhone,
      notes: params.notes,
      status: LeadStatus.NEW,
    },
  });
}

export async function assignReferralAttributionOnOnboarding(
  newBusinessId: string,
  referralCodeValue: string,
) {
  const referralCode = await prisma.referralCode.findUnique({
    where: { code: referralCodeValue.toUpperCase() },
    include: { business: true },
  });
  if (!referralCode || !referralCode.is_active) {
    throw new Error("Referral code not found");
  }
  if (referralCode.business_id === newBusinessId) {
    throw new Error("Self referral is not allowed");
  }

  return prisma.referralAttribution.upsert({
    where: { referred_business_id: newBusinessId },
    create: {
      referral_code_id: referralCode.id,
      referrer_business_id: referralCode.business_id,
      referred_business_id: newBusinessId,
      status: ReferralStatus.PENDING,
    },
    update: {
      referral_code_id: referralCode.id,
      referrer_business_id: referralCode.business_id,
      status: ReferralStatus.PENDING,
      rejected_at: null,
      rejection_reason: null,
    },
  });
}

export async function qualifyAndRewardReferralForBusiness(referredBusinessId: string) {
  return prisma.$transaction(async (tx) => {
    const attribution = await tx.referralAttribution.findUnique({
      where: { referred_business_id: referredBusinessId },
      include: {
        referrer_business: {
          include: {
            subscriptions: {
              include: { plan: true },
            },
          },
        },
      },
    });
    if (!attribution) return null;
    if (attribution.status === ReferralStatus.REWARDED) return attribution;
    if (attribution.status === ReferralStatus.REJECTED) return attribution;

    const firstPaidInvoice = await tx.subscriptionInvoice.findFirst({
      where: {
        business_id: referredBusinessId,
        status: InvoiceStatus.PAID,
        amount_paid: { gt: 0 },
      },
      select: { id: true },
      orderBy: { paid_at: "asc" },
    });
    if (!firstPaidInvoice) return attribution;

    const referrerSubscription = attribution.referrer_business.subscriptions[0];
    if (!referrerSubscription) return attribution;

    const monthlyPlan = await tx.subscriptionPlan.findUnique({
      where: { code: "PRO_MONTHLY" },
      select: { price_amount: true },
    });
    if (!monthlyPlan) return attribution;

    const capCentavos = monthlyPlan.price_amount * REFERRAL_REWARD_CAP_MONTHS;
    const rewardTotal = await tx.subscriptionCreditLedger.aggregate({
      where: {
        business_subscription_id: referrerSubscription.id,
        source: CreditSource.REFERRAL_REWARD,
      },
      _sum: {
        amount_total: true,
      },
    });
    const usedCap = rewardTotal._sum.amount_total ?? 0;
    const availableCap = Math.max(0, capCentavos - usedCap);
    const rewardAmount = Math.min(monthlyPlan.price_amount, availableCap);

    let rewardLedgerId: string | null = null;
    if (rewardAmount > 0) {
      const reward = await tx.subscriptionCreditLedger.create({
        data: {
          business_subscription_id: referrerSubscription.id,
          source: CreditSource.REFERRAL_REWARD,
          amount_total: rewardAmount,
          amount_remaining: rewardAmount,
          description: `Referral reward for business ${referredBusinessId}`,
        },
      });
      rewardLedgerId = reward.id;
    }

    await tx.referralAttribution.update({
      where: { id: attribution.id },
      data: {
        status: ReferralStatus.REWARDED,
        qualified_at: attribution.qualified_at ?? getCurrentDateTimePH(),
        rewarded_at: getCurrentDateTimePH(),
        reward_credit_ledger_id: rewardLedgerId,
      },
    });

    return attribution;
  });
}

export function formatCentavosToPhp(centavos: number) {
  return convertCentavosToAmount(centavos).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
