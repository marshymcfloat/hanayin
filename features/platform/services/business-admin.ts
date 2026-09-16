import crypto from "crypto";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/features/auth/auth-options";
import {
  assignReferralAttributionOnOnboarding,
  DEFAULT_SUBSCRIPTION_PLAN_CODE,
  ensureBusinessSubscription,
  ensureDefaultPlans,
  ensureReferralCode,
  getDefaultTrialMonths,
  getPeriodEnd,
  SUBSCRIPTION_PLAN_CODES,
} from "@/features/billing/subscription-service";
import { clearDemoBusinessData } from "@/features/demo-trial/seed-demo-business";
import {
  getBusinessStructureTemplate,
  normalizeBusinessStructure,
} from "@/lib/business-structure";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { normalizePhilippinePhone } from "@/lib/services/sms-otp";
import { Prisma } from "@/prisma/generated/prisma/client";
import {
  BusinessStructure,
  SubscriptionStatus,
} from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

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

async function logBusinessAdminAction(input: {
  action: string;
  targetType: string;
  targetId: string;
  businessId: string;
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
      business: { connect: { id: input.businessId } },
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
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

export async function generateUniqueBusinessSlug(name: string) {
  const base = normalizeSlugPart(name) || "business";
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? base : `${base}-${suffix}`;
    const existing = await prisma.business.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    suffix += 1;
  }
}

export function generateBusinessInitials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (letters || "SF").slice(0, 2).padEnd(2, "F");
}

export async function createBusinessWithSubscription(
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
    input.allowEmployeeSelfBooking ?? structureTemplate.allowEmployeeSelfBooking;
  const managerCanServe = input.managerCanServe ?? structureTemplate.managerCanServe;

  const normalizedOwnerContact = normalizePhilippinePhone(input.ownerContactNumber);
  if (!/^63\d{10}$/.test(normalizedOwnerContact)) {
    return { success: false as const, error: "Invalid owner contact number" };
  }

  const slugTaken = await prisma.business.findUnique({
    where: { slug: input.businessSlug },
    select: { id: true },
  });
  if (slugTaken) {
    return {
      success: false as const,
      error: `Slug "${input.businessSlug}" is already in use. Pick another.`,
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
            is_primary: true,
          },
        },
      },
    });
    return { ownerUser, business };
  });

  let subscription;
  try {
    subscription = await ensureBusinessSubscription(created.business.id, {
      planCode: input.planCode,
      trialMonths,
    });
    await ensureReferralCode(created.business.id);
    if (input.referralCode) {
      await assignReferralAttributionOnOnboarding(
        created.business.id,
        input.referralCode,
      );
    }
  } catch (seedError) {
    await prisma
      .$transaction(async (tx) => {
        await tx.business.delete({ where: { id: created.business.id } });
        await tx.user.delete({ where: { id: created.ownerUser.id } });
      })
      .catch((rollbackError) => {
        console.error(
          "[createBusinessWithSubscriptionAction] compensating delete failed; manual cleanup required",
          { businessId: created.business.id, rollbackError },
        );
      });
    return {
      success: false as const,
      error:
        seedError instanceof Error
          ? `Subscription seeding failed: ${seedError.message}`
          : "Subscription seeding failed.",
    };
  }

  await logBusinessAdminAction({
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

export async function suspendBusiness(businessId: string, reason: string) {
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

  await logBusinessAdminAction({
    action: "BUSINESS_SUSPENDED",
    targetType: "BusinessSubscription",
    targetId: updated.id,
    businessId,
    metadata: { reason },
  });

  revalidatePath("/platform/businesses");
  return { success: true as const, data: updated };
}

export async function reactivateBusiness(businessId: string) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  const subscription = await ensureBusinessSubscription(businessId);
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
      trial_ends_at: null,
    },
  });

  await logBusinessAdminAction({
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

export async function clearDemoData(businessId: string) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;

  await clearDemoBusinessData(businessId);
  await logBusinessAdminAction({
    action: "DEMO_DATA_CLEARED",
    targetType: "Business",
    targetId: businessId,
    businessId,
  });

  revalidatePath("/platform/businesses");
  return { success: true as const };
}
