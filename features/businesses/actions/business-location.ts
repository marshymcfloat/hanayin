"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTenantWriteAccess } from "@/lib/auth/guards";
import { setBusinessLocation } from "@/features/businesses/repositories/business-location";

const businessLocationSchema = z.object({
  businessSlug: z.string().min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export async function updateBusinessLocation(
  businessSlug: string,
  latitude: number,
  longitude: number,
) {
  const input = businessLocationSchema.parse({ businessSlug, latitude, longitude });
  const auth = await requireTenantWriteAccess(input.businessSlug);
  if (!auth.success) return auth;

  try {
    await setBusinessLocation(input);

    revalidatePath(`/app/${input.businessSlug}`);
    revalidatePath(`/app/${input.businessSlug}/business`);

    return { success: true };
  } catch (error) {
    console.error("Failed to update business location:", error);
    return { success: false, error: "Failed to update location" };
  }
}
