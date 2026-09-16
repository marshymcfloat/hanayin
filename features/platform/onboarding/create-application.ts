import {
  getBusinessStructureTemplate,
  normalizeBusinessStructure,
} from "@/lib/business-structure";
import { createOnboardingStatusToken } from "@/lib/security/onboarding-status-token";
import { sendOnboardingApplicationAcknowledgement } from "@/lib/services/onboarding-applications";
import {
  createOnboardingApplication,
  findReferralCode,
} from "@/features/platform/onboarding/repository";
import type { CreateOnboardingApplicationInput } from "@/features/platform/onboarding/schemas";

export async function submitOnboardingApplication(
  input: CreateOnboardingApplicationInput,
) {
  const normalizedReferralCode = input.referralCode?.trim().toUpperCase() || null;
  const requestedStructure = normalizeBusinessStructure(input.requestedStructure);
  const template = getBusinessStructureTemplate(requestedStructure);
  const requestedAllowEmployeeSelfBooking =
    input.requestedAllowEmployeeSelfBooking ?? template.allowEmployeeSelfBooking;
  const requestedManagerCanServe =
    input.requestedManagerCanServe ?? template.managerCanServe;

  let referralCodeId: string | null = null;
  if (normalizedReferralCode) {
    const referralCode = await findReferralCode(normalizedReferralCode);
    if (!referralCode || !referralCode.is_active) {
      return {
        success: false as const,
        error: "Referral code is invalid or inactive.",
      };
    }
    referralCodeId = referralCode.id;
  }

  const application = await createOnboardingApplication({
    businessName: input.businessName.trim(),
    ownerName: input.ownerName.trim(),
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    ownerPhone: input.ownerPhone?.trim() || null,
    notes: input.notes?.trim() || null,
    requestedStructure,
    requestedAllowEmployeeSelfBooking,
    requestedManagerCanServe,
    referralCodeInput: normalizedReferralCode,
    referralCodeId,
  });

  const statusToken = createOnboardingStatusToken({
    applicationId: application.id,
    ownerEmail: application.owner_email,
  });
  const acknowledgement = await sendOnboardingApplicationAcknowledgement({
    ownerEmail: application.owner_email,
    ownerName: application.owner_name,
    businessName: application.business_name,
    statusToken,
  });

  return {
    success: true as const,
    data: application,
    statusToken,
    acknowledgementSent: acknowledgement.success,
  };
}
