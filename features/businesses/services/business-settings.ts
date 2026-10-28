import "server-only";
import { prisma } from "@/prisma/prisma";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import { businessSettingsWhere } from "@/features/businesses/business-settings-access";
import type { BusinessSettingsInput, BusinessSettingsImages } from "@/features/businesses/business-settings-types";
export class BusinessSettingsError extends Error {}
export async function persistBusinessSettings(context: OwnerActorContext, input: BusinessSettingsInput, images: BusinessSettingsImages): Promise<void> {
  let where;
  try { where = businessSettingsWhere(context); } catch { throw new BusinessSettingsError("Forbidden"); }
  await prisma.$transaction(async tx => {
    const business = await tx.business.update({ where: { ...where, id: context.businessId, slug: context.businessSlug }, data: {
      name: input.name, initials: input.initials, description: input.description, imageUrl: images.imageUrl, latitude: input.latitude, longitude: input.longitude,
      structure: input.structure, allow_employee_self_booking: input.allowEmployeeSelfBooking, manager_can_serve: input.managerCanServe, timezone: input.timezone, formal_schedule_enabled: input.formalScheduleEnabled,
      gcash_account_name: input.gcashAccountName, gcash_mobile_number: input.gcashMobileNumber, gcash_qr_image_url: images.gcashQrImageUrl, gcash_instructions: input.gcashInstructions,
    }, select: { id: true } });
    const growth = { business_type: input.growthBusinessType, max_discount_percent: input.growthMaxDiscountPercent, enable_student_promo: input.growthEnableStudentPromo, avoid_cheap_wording: input.growthAvoidCheapWording, weather_hooks_enabled: input.growthWeatherHooksEnabled, tone_profile: input.growthToneProfile };
    await tx.businessGrowthSettings.upsert({ where: { business_id: business.id }, create: { business_id: business.id, ...growth }, update: growth, select: { business_id: true } });
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
}
export function businessSettingsFailure(error: unknown) {
  if (error instanceof BusinessSettingsError) return error.message;
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "P2025") return "Forbidden";
    if (error.code === "P2034") return "Business settings changed. Refresh and try again.";
  }
  return "Failed to update business settings.";
}
