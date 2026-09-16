import { prisma, supportsOnboardingApplicationModel } from "@/prisma/prisma";

import type { BusinessStructure } from "@/prisma/generated/prisma/enums";

export function isOnboardingApplicationPersistenceAvailable() {
  return supportsOnboardingApplicationModel();
}

export async function findReferralCode(code: string) {
  return prisma.referralCode.findUnique({
    where: { code },
    select: { id: true, is_active: true },
  });
}

export async function createOnboardingApplication(input: {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  notes: string | null;
  requestedStructure: BusinessStructure;
  requestedAllowEmployeeSelfBooking: boolean;
  requestedManagerCanServe: boolean;
  referralCodeInput: string | null;
  referralCodeId: string | null;
}) {
  return prisma.onboardingApplication.create({
    data: {
      business_name: input.businessName,
      owner_name: input.ownerName,
      owner_email: input.ownerEmail,
      owner_phone: input.ownerPhone,
      notes: input.notes,
      requested_structure: input.requestedStructure,
      requested_allow_employee_self_booking:
        input.requestedAllowEmployeeSelfBooking,
      requested_manager_can_serve: input.requestedManagerCanServe,
      referral_code_input: input.referralCodeInput,
      referral_code_id: input.referralCodeId,
      status: "NEW",
    },
  });
}
