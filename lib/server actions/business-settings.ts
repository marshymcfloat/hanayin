"use server";

import { prisma } from "@/prisma/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { tenantCacheTags } from "@/lib/data/cached";
import { getBusinessStructureTemplate, normalizeBusinessStructure } from "@/lib/business-structure";
import { normalizeGrowthToneProfile } from "@/lib/services/growth/tone-profiles";

const DEFAULT_TIMEZONE = "Asia/Manila";

// Rejects garbage like "PST" / "GMT+8" / empty string. Intl will throw on
// an unknown IANA name — caller falls back to the previous value.
function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function updateBusinessAction(
  businessSlug: string,
  formData: FormData,
) {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
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
    const growthToneProfile = normalizeGrowthToneProfile(
      formData.get("growthToneProfile") as string | null,
    );
    const structure = normalizeBusinessStructure(
      formData.get("structure"),
    );
    const structureTemplate = getBusinessStructureTemplate(structure);
    const allowEmployeeSelfBookingValue = formData.get(
      "allowEmployeeSelfBooking",
    );
    const managerCanServeValue = formData.get("managerCanServe");
    const allowEmployeeSelfBooking =
      typeof allowEmployeeSelfBookingValue === "string"
        ? allowEmployeeSelfBookingValue.toLowerCase() === "true"
        : structureTemplate.allowEmployeeSelfBooking;
    const managerCanServe =
      typeof managerCanServeValue === "string"
        ? managerCanServeValue.toLowerCase() === "true"
        : structureTemplate.managerCanServe;

    const timezoneRaw = (formData.get("timezone") as string | null) ?? "";
    const timezone = isValidIanaTimeZone(timezoneRaw)
      ? timezoneRaw
      : DEFAULT_TIMEZONE;

    const formalScheduleEnabled =
      (formData.get("formalScheduleEnabled") as string | null)?.toLowerCase() ===
      "true";

    const updatedBusiness = await prisma.business.update({
      where: { slug: businessSlug },
      data: {
        name,
        initials: initials.toUpperCase(),
        description,
        imageUrl,
        latitude: latitude,
        longitude: longitude,
        structure,
        allow_employee_self_booking: allowEmployeeSelfBooking,
        manager_can_serve: managerCanServe,
        timezone,
        formal_schedule_enabled: formalScheduleEnabled,
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
    revalidatePath(`/app/${businessSlug}/services`);
    revalidatePath(`/app/${businessSlug}/packages`);
    revalidatePath(`/explore`);
    revalidateTag(tenantCacheTags.businessBySlug(businessSlug), "max");
    revalidateTag(tenantCacheTags.businessHoursAndEmployees(businessSlug), "max");

    return { success: true };
  } catch (error) {
    console.error("Update business error:", error);
    return { success: false, error: "Failed to update business settings." };
  }
}
