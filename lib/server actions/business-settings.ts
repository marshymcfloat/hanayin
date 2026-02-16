"use server";

import { prisma } from "@/prisma/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireTenantWriteAccess } from "@/lib/auth/guards";
import { tenantCacheTags } from "@/lib/data/cached";

export async function updateBusinessAction(
  businessSlug: string,
  formData: FormData,
) {
  const auth = await requireTenantWriteAccess(businessSlug);
  if (!auth.success) return auth;

  try {
    const name = formData.get("name") as string;
    const initials = formData.get("initials") as string;
    const description = formData.get("description") as string;

    // Existing image URL
    let imageUrl = formData.get("existingImageUrl") as string;

    // Handle new file upload
    const imageFile = formData.get("imageFile") as File;
    if (imageFile && imageFile.size > 0) {
      try {
        const { put } = await import("@vercel/blob");
        const blob = await put(imageFile.name, imageFile, {
          access: "public",
          allowOverwrite: true,
          addRandomSuffix: true,
        });
        imageUrl = blob.url;
      } catch (error) {
        console.error("Blob upload error:", error);
        return {
          success: false,
          error:
            "Failed to upload image. Please check your storage configuration.",
        };
      }
    }

    const latStr = formData.get("latitude") as string;
    const lngStr = formData.get("longitude") as string;

    const latitude = latStr ? parseFloat(latStr) : null;
    const longitude = lngStr ? parseFloat(lngStr) : null;

    const growthBusinessType = (formData.get("growthBusinessType") as string) || "SALON";
    const growthMaxDiscountPercentRaw = formData.get("growthMaxDiscountPercent") as string;
    const growthMaxDiscountPercent = Math.min(
      80,
      Math.max(1, Number.parseFloat(growthMaxDiscountPercentRaw || "20") || 20),
    );
    const growthEnableStudentPromo = formData.get("growthEnableStudentPromo") === "on";
    const growthAvoidCheapWording = formData.get("growthAvoidCheapWording") === "on";
    const growthWeatherHooksEnabled = formData.get("growthWeatherHooksEnabled") === "on";
    const growthToneProfile =
      ((formData.get("growthToneProfile") as string) || "taglish-natural").trim() ||
      "taglish-natural";

    const updatedBusiness = await prisma.business.update({
      where: { slug: businessSlug },
      data: {
        name,
        initials: initials.toUpperCase(),
        description,
        imageUrl,
        latitude: latitude,
        longitude: longitude,
      },
    });

    await prisma.businessGrowthSettings.upsert({
      where: { business_id: updatedBusiness.id },
      create: {
        business_id: updatedBusiness.id,
        business_type: growthBusinessType as "SALON" | "SPA" | "CLINIC" | "BARBERSHOP",
        max_discount_percent: growthMaxDiscountPercent,
        enable_student_promo: growthEnableStudentPromo,
        avoid_cheap_wording: growthAvoidCheapWording,
        weather_hooks_enabled: growthWeatherHooksEnabled,
        tone_profile: growthToneProfile,
      },
      update: {
        business_type: growthBusinessType as "SALON" | "SPA" | "CLINIC" | "BARBERSHOP",
        max_discount_percent: growthMaxDiscountPercent,
        enable_student_promo: growthEnableStudentPromo,
        avoid_cheap_wording: growthAvoidCheapWording,
        weather_hooks_enabled: growthWeatherHooksEnabled,
        tone_profile: growthToneProfile,
      },
    });

    revalidatePath(`/app/${businessSlug}`);
    revalidatePath(`/app/${businessSlug}/business`);
    revalidatePath(`/explore`);
    revalidateTag(tenantCacheTags.businessBySlug(businessSlug), "max");
    revalidateTag(tenantCacheTags.businessHoursAndEmployees(businessSlug), "max");

    return { success: true };
  } catch (error) {
    console.error("Update business error:", error);
    return { success: false, error: "Failed to update business settings." };
  }
}
