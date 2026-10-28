"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { tenantCacheTags } from "@/lib/data/cached";
import { businessSlugSchema } from "@/lib/validation/business-slug";
import { requireBusinessSettingsAccess } from "@/features/businesses/business-settings-access";
import { parseBusinessSettings } from "@/features/businesses/business-settings-schemas";
import { updateTenantBusinessSettings } from "@/features/businesses/services/business-settings-lifecycle";
import { businessSettingsFailure } from "@/features/businesses/services/business-settings";
export async function updateBusinessAction(businessSlug: string, formData: FormData) {
  if (!businessSlugSchema.safeParse(businessSlug).success) return { success: false, error: "Invalid business settings." };
  try {
    const access = await requireBusinessSettingsAccess(businessSlug);
    if (!access.success) return access;
    const input = parseBusinessSettings(formData);
    if (!input.success) return input;
    await updateTenantBusinessSettings(access.context, input.data);
    for (const path of [`/app/${businessSlug}`, `/app/${businessSlug}/business`, `/app/${businessSlug}/services`, `/app/${businessSlug}/packages`, "/explore"]) {
      try { revalidatePath(path); } catch { /* Committed settings remain successful. */ }
    }
    for (const invalidate of [() => revalidateTag(tenantCacheTags.businessBySlug(businessSlug), "max"), () => revalidateTag(tenantCacheTags.businessHoursAndEmployees(businessSlug), "max")]) {
      try { invalidate(); } catch { /* Committed settings remain successful. */ }
    }
    return { success: true };
  } catch (error) { return { success: false, error: businessSettingsFailure(error) }; }
}
