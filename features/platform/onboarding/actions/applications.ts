"use server";

import { headers } from "next/headers";

import { rateLimit } from "@/lib/rate-limit";
import { submitOnboardingApplication } from "@/features/platform/onboarding/create-application";
import { isOnboardingApplicationPersistenceAvailable } from "@/features/platform/onboarding/repository";
import {
  createOnboardingApplicationSchema,
  type CreateOnboardingApplicationInput,
} from "@/features/platform/onboarding/schemas";

export async function createOnboardingApplicationAction(
  rawInput: CreateOnboardingApplicationInput,
) {
  if (!isOnboardingApplicationPersistenceAvailable()) {
    return {
      success: false as const,
      error: "Onboarding applications are unavailable. Please restart the server.",
    };
  }

  const input = createOnboardingApplicationSchema.parse(rawInput);
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

  return submitOnboardingApplication(input);
}
