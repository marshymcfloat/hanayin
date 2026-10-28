"use server";

import { authOptions } from "@/features/auth/auth-options";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { clientIpFromForwardedFor } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { availableSlotsSchema, dayCapacitySchema, alternativeSlotsSchema, availableProvidersSchema, categoryAvailabilitySchema, parsePublicAvailability, type AvailableSlotsInput, type DayCapacityInput, type AlternativeSlotsInput, type AvailableProvidersInput, type CategoryAvailabilityInput } from "@/features/bookings/public-availability-schemas";
import { lookupPublicAvailableSlots, lookupPublicDayCapacity, lookupPublicAlternativeSlots, lookupPublicProviders, lookupPublicCategoryAvailability, lookupPublicBusinessHours } from "@/features/bookings/services/public-availability";
import type { z } from "zod";

export type { AvailableSlotsInput as GetAvailableSlotsParams } from "@/features/bookings/public-availability-schemas";
const RATE_LIMIT_ERROR = "Too many availability requests. Please try again shortly.";

async function applyAvailabilityRateLimit(businessSlug: string, kind: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return;
  const requestHeaders = await headers();
  const ip = clientIpFromForwardedFor(requestHeaders.get("x-forwarded-for"));
  const result = await rateLimit(`public-availability:${kind}:${businessSlug}:${ip}`, { windowMs: 60_000, maxRequests: 60 });
  if (!result.success) throw new Error(RATE_LIMIT_ERROR);
}

async function runAvailability<T, R>(schema: z.ZodType<T>, input: unknown, kind: string, lookup: (value: T) => Promise<R>): Promise<R> {
  const parsed = parsePublicAvailability(schema, input);
  const slug = typeof parsed === "string" ? parsed : (parsed as { businessSlug: string }).businessSlug;
  try {
    await applyAvailabilityRateLimit(slug, kind);
    return await lookup(parsed);
  } catch (error) {
    if (error instanceof Error && (error.message === RATE_LIMIT_ERROR || error.message === "Business not found")) throw new Error(error.message);
    throw new Error("Unable to load availability");
  }
}

export async function getAvailableSlots(input: AvailableSlotsInput) {
  return runAvailability(availableSlotsSchema, input, "slots", lookupPublicAvailableSlots);
}
export async function getDayCapacityRange(input: DayCapacityInput) {
  return runAvailability(dayCapacitySchema, input, "day-capacity", lookupPublicDayCapacity);
}
export async function getAlternativeSlots(input: AlternativeSlotsInput) {
  return runAvailability(alternativeSlotsSchema, input, "alternatives", lookupPublicAlternativeSlots);
}
export async function getAvailableProviders(input: AvailableProvidersInput) {
  return runAvailability(availableProvidersSchema, input, "providers", lookupPublicProviders);
}
export async function checkCategoryAvailability(input: CategoryAvailabilityInput) {
  return runAvailability(categoryAvailabilitySchema, input, "category", lookupPublicCategoryAvailability);
}
export async function getBusinessHours(businessSlug: string) {
  return runAvailability(businessSlugSchema, businessSlug, "hours", lookupPublicBusinessHours);
}
