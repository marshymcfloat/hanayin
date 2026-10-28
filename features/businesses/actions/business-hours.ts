"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerPermission } from "@/lib/auth/owner-access";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { businessHoursInputSchema, businessHoursSaveOptionsSchema } from "@/features/businesses/business-hours-schemas";
import { readPublicBusinessHours, readPublicServiceCategories } from "@/features/businesses/queries/business-hours";
import { saveBusinessHours } from "@/features/businesses/services/business-hours";
import type { BusinessHourInput as HourInput } from "@/features/businesses/types/business-hours";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";

export type BusinessHourInput = HourInput;

export async function getBusinessHours(businessSlug: string): Promise<BusinessHourInput[]> {
  const slug = businessSlugSchema.safeParse(businessSlug);
  if (!slug.success) throw new Error("Invalid input");
  try { return await readPublicBusinessHours(slug.data); }
  catch { throw new Error("Unable to load business hours."); }
}

export async function getServiceCategories(businessSlug: string): Promise<string[]> {
  const slug = businessSlugSchema.safeParse(businessSlug);
  if (!slug.success) throw new Error("Invalid input");
  try { return await readPublicServiceCategories(slug.data); }
  catch { throw new Error("Unable to load service categories."); }
}

export async function updateBusinessHours(businessSlug: string, hours: unknown, options?: unknown): Promise<
  { success: true } | { success: false; error: string }
> {
  const slug = businessSlugSchema.safeParse(businessSlug);
  const validation = businessHoursInputSchema.safeParse(hours);
  const parsedOptions = options === undefined ? undefined : businessHoursSaveOptionsSchema.safeParse(options);
  if (!slug.success || !validation.success || (parsedOptions && !parsedOptions.success)) return { success: false, error: "Invalid input" };
  let result: Awaited<ReturnType<typeof saveBusinessHours>>;
  try {
    const access = await requireOwnerPermission(slug.data, OwnerPermission.SETTINGS_MANAGE);
    if (!access.success) return access;
    result = await saveBusinessHours(access.context, validation.data, parsedOptions?.data);
  } catch { return { success: false, error: "Unable to update business hours." }; }
  if (!result.success) return result;
  try { revalidatePath(`/app/${slug.data}/business-hours`); } catch { /* Persistence already committed. */ }
  try { revalidatePath(`/${slug.data}/booking`); } catch { /* Persistence already committed. */ }
  return result;
}
