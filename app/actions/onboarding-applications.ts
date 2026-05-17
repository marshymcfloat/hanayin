"use server";

import { z } from "zod";
import { headers } from "next/headers";

import { prisma, supportsOnboardingApplicationModel } from "@/prisma/prisma";
import { createOnboardingStatusToken } from "@/lib/security/onboarding-status-token";
import { sendOnboardingApplicationAcknowledgement } from "@/lib/services/onboarding-applications";
import { BusinessStructure } from "@/prisma/generated/prisma/enums";
import {
  getBusinessStructureTemplate,
  normalizeBusinessStructure,
} from "@/lib/business-structure";
import { rateLimit } from "@/lib/rate-limit";

const createOnboardingApplicationSchema = z.object({
  businessName: z.string().min(2),
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerPhone: z.string().max(30).optional(),
  notes: z.string().max(1000).optional(),
  referralCode: z.string().max(50).optional(),
  requestedStructure: z.nativeEnum(BusinessStructure).optional(),
  requestedAllowEmployeeSelfBooking: z.boolean().optional(),
  requestedManagerCanServe: z.boolean().optional(),
});

export async function createOnboardingApplicationAction(
  rawInput: z.infer<typeof createOnboardingApplicationSchema>,
) {
  if (!supportsOnboardingApplicationModel()) {
    return {
      success: false as const,
      error: "Onboarding applications are unavailable. Please restart the server.",
    };
  }

  const input = createOnboardingApplicationSchema.parse(rawInput);

  // Rate limit by IP and by email separately. The endpoint is public, creates
  // DB rows, sends an email per call, and ships SMS via downstream actions —
  // all of which are cost vectors. Both keys must allow the request through.
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown";
  const normalizedEmail = input.ownerEmail.trim().toLowerCase();
  const ipLimit = await rateLimit(`apply:ip:${ip}`, {
    windowMs: 60 * 60 * 1000,
    maxRequests: 10,
    namespace: "service-flow:apply",
  });
  const emailLimit = await rateLimit(`apply:email:${normalizedEmail}`, {
    windowMs: 60 * 60 * 1000,
    maxRequests: 3,
    namespace: "service-flow:apply",
  });
  if (!ipLimit.success || !emailLimit.success) {
    return {
      success: false as const,
      error: "Too many applications. Please try again later.",
    };
  }
  const normalizedReferralCode = input.referralCode?.trim().toUpperCase() || null;
  const requestedStructure = normalizeBusinessStructure(input.requestedStructure);
  const template = getBusinessStructureTemplate(requestedStructure);
  const requestedAllowEmployeeSelfBooking =
    input.requestedAllowEmployeeSelfBooking ??
    template.allowEmployeeSelfBooking;
  const requestedManagerCanServe =
    input.requestedManagerCanServe ?? template.managerCanServe;

  let referralCodeId: string | null = null;
  if (normalizedReferralCode) {
    const referralCode = await prisma.referralCode.findUnique({
      where: { code: normalizedReferralCode },
      select: { id: true, is_active: true },
    });
    if (!referralCode || !referralCode.is_active) {
      return { success: false as const, error: "Referral code is invalid or inactive." };
    }
    referralCodeId = referralCode.id;
  }

  const application = await prisma.onboardingApplication.create({
    data: {
      business_name: input.businessName.trim(),
      owner_name: input.ownerName.trim(),
      owner_email: input.ownerEmail.trim().toLowerCase(),
      owner_phone: input.ownerPhone?.trim() || null,
      notes: input.notes?.trim() || null,
      requested_structure: requestedStructure,
      requested_allow_employee_self_booking: requestedAllowEmployeeSelfBooking,
      requested_manager_can_serve: requestedManagerCanServe,
      referral_code_input: normalizedReferralCode,
      referral_code_id: referralCodeId,
      status: "NEW",
    },
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
