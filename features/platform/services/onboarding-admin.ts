import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  DEFAULT_SUBSCRIPTION_PLAN_CODE,
  SUBSCRIPTION_PLAN_CODES,
} from "@/features/billing/subscription-service";
import { seedDemoBusiness } from "@/features/demo-trial/seed-demo-business";
import {
  createBusinessWithSubscription,
  generateBusinessInitials,
  generateUniqueBusinessSlug,
} from "./business-admin";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import {
  getBusinessStructureTemplate,
  normalizeBusinessStructure,
} from "@/lib/business-structure";
import { logger } from "@/lib/logger";
import {
  createOnboardingLoginToken,
  ONBOARDING_LOGIN_TOKEN_TTL_SECONDS_DEFAULT,
} from "@/lib/security/onboarding-login-token";
import { sendSemaphoreMagicLink } from "@/lib/services/sms-otp";
import {
  BusinessStructure,
  OnboardingApplicationStatus,
} from "@/prisma/generated/prisma/enums";
import { prisma, supportsOnboardingApplicationModel } from "@/prisma/prisma";
import { logPlatformAction } from "./platform-action-log";

const updateOnboardingApplicationStatusSchema = z.object({
  applicationId: z.string().min(1),
  status: z.enum(["NEW", "CONTACTED", "APPROVED", "REJECTED", "CONVERTED"]),
  reviewNotes: z.string().max(1000).optional(),
});

const convertOnboardingApplicationSchema = z.object({
  applicationId: z.string().min(1),
  planCode: z
    .enum(SUBSCRIPTION_PLAN_CODES)
    .default(DEFAULT_SUBSCRIPTION_PLAN_CODE),
  trialMonths: z.number().int().min(1).max(12).optional(),
  ownerPassword: z.string().min(8),
  structure: z.nativeEnum(BusinessStructure).optional(),
  allowEmployeeSelfBooking: z.boolean().optional(),
  managerCanServe: z.boolean().optional(),
  seedDemoData: z.boolean().default(true),
});

export async function updateOnboardingApplicationStatus(
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
  const stampReviewer =
    input.status === "APPROVED" || input.status === "REJECTED";
  const updated = await prisma.onboardingApplication.update({
    where: { id: input.applicationId },
    data: {
      status: input.status as OnboardingApplicationStatus,
      review_notes: input.reviewNotes ?? null,
      ...(stampReviewer
        ? { reviewed_by_user_id: auth.session.user.id, reviewed_at: new Date() }
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

export async function convertOnboardingApplicationToBusiness(
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
    include: { referral_code: { select: { code: true, is_active: true } } },
  });
  if (!application) {
    return {
      success: false as const,
      error: "Onboarding application not found",
    };
  }
  if (application.converted_business_id) {
    return { success: false as const, error: "Application already converted" };
  }
  if (application.status === OnboardingApplicationStatus.REJECTED) {
    return {
      success: false as const,
      error:
        "Application is REJECTED. Re-open it (mark NEW or CONTACTED) before converting.",
    };
  }
  const businessSlug = await generateUniqueBusinessSlug(
    application.business_name,
  );
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
  const creation = await createBusinessWithSubscription({
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
  if (!creation.success) return creation;

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
    logger.error(
      "[OnboardingConversion] application link failed; rolling back business",
      {
        applicationId: application.id,
        businessId: creation.business.id,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    try {
      await prisma.business.delete({ where: { id: creation.business.id } });
      await prisma.user.delete({ where: { id: creation.ownerUserId } });
    } catch (rollbackError) {
      logger.error(
        "[OnboardingConversion] rollback failed; manual cleanup required",
        {
          businessId: creation.business.id,
          ownerUserId: creation.ownerUserId,
          rollbackError:
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
        },
      );
    }
    return {
      success: false as const,
      error:
        "Failed to link application to new business; conversion rolled back. Try again.",
    };
  }

  await prisma.user.update({
    where: { id: creation.ownerUserId },
    data: { must_change_password: true },
  });
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
  revalidatePath("/apply/status");
  return {
    success: true as const,
    data: {
      application: updated,
      business: creation.business,
      ownerContactNumber: creation.ownerContactNumber,
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

export async function resendMagicLink(businessId: string) {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      slug: true,
      owners: {
        orderBy: [{ is_primary: "desc" }, { id: "asc" }],
        take: 1,
        select: {
          user_id: true,
          user: { select: { contact_number: true, name: true } },
        },
      },
    },
  });
  if (!business)
    return { success: false as const, error: "Business not found" };
  const owner = business.owners[0];
  if (!owner?.user_id) {
    return { success: false as const, error: "Business has no owner record" };
  }
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
