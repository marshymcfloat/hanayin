import { revalidatePath } from "next/cache";

import {
  assignReferralAttributionOnOnboarding,
  qualifyAndRewardReferralForBusiness,
} from "@/features/billing/subscription-service";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { logger } from "@/lib/logger";
import { prisma } from "@/prisma/prisma";
import { logPlatformAction } from "./platform-action-log";

export async function assignReferralOnOnboarding(
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

export async function runReferralRewardQualification() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return auth;
  const pending = await prisma.referralAttribution.findMany({
    where: { status: { in: ["PENDING", "QUALIFIED"] } },
    select: { referred_business_id: true },
  });
  const uniqueBusinessIds = Array.from(
    new Set(pending.map((item) => item.referred_business_id)),
  );
  const concurrency = 8;
  let cursor = 0;
  let failures = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, uniqueBusinessIds.length) }).map(
      async () => {
        while (cursor < uniqueBusinessIds.length) {
          const businessId = uniqueBusinessIds[cursor++];
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

export async function updateReferralLeadStatus(params: {
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
        params.status === "CONVERTED"
          ? params.convertedBusinessId || null
          : null,
    },
  });
  await logPlatformAction({
    action: "REFERRAL_LEAD_STATUS_UPDATED",
    targetType: "ReferralLead",
    targetId: updated.id,
    businessId: updated.converted_business_id,
    metadata: { status: updated.status },
  });
  revalidatePath("/platform/referrals");
  return { success: true as const, data: updated };
}

export async function rejectReferralAttribution(
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
