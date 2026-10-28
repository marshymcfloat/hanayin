"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerPermission } from "@/lib/auth/owner-access";
import type { BookingPolicy } from "@/lib/types/booking-policy";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { bookingPolicyInputSchema } from "@/features/bookings/booking-policy-schemas";
import { readPublicBookingPolicy } from "@/features/bookings/queries/booking-policy";
import { saveBookingPolicy } from "@/features/bookings/services/booking-policy";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";

export async function getBookingPolicy(businessSlug: string): Promise<BookingPolicy> {
  const slug = businessSlugSchema.safeParse(businessSlug);
  if (!slug.success) throw new Error("Invalid input");
  try { return await readPublicBookingPolicy(slug.data); }
  catch { throw new Error("Unable to load booking policy."); }
}

export async function updateBookingPolicy(businessSlug: string, input: unknown): Promise<
  { success: true } | { success: false; error: string }
> {
  const slug = businessSlugSchema.safeParse(businessSlug);
  const validation = bookingPolicyInputSchema.safeParse(input);
  if (!slug.success || !validation.success) return { success: false, error: "Invalid input" };
  try {
    const access = await requireOwnerPermission(slug.data, OwnerPermission.SETTINGS_MANAGE);
    if (!access.success) return access;
    const result = await saveBookingPolicy(access.context, validation.data);
    if (result.success) {
      revalidatePath(`/app/${access.context.businessSlug}`);
      revalidatePath(`/app/${access.context.businessSlug}/business-hours`);
      revalidatePath(`/${access.context.businessSlug}/booking`);
    }
    return result;
  } catch { return { success: false, error: "Unable to update booking policy." }; }
}
