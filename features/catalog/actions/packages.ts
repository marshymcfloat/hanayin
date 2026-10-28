"use server";

import { requireAuth } from "@/lib/auth/guards";
import { requireStaffPermission } from "@/lib/auth/staff-access";
import { tenantCacheTags } from "@/lib/data/cached";
import { createPackageSchema, packageDetailsSchema, packageIdSchema, type CreatePackageInput, type PackageDetails } from "@/features/catalog/package-schemas";
import { createCatalogPackage, replaceCatalogPackage, deleteCatalogPackage } from "@/features/catalog/services/package-administration";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { revalidatePath, revalidateTag } from "next/cache";

function invalidatePackages(slug: string, businessId: string) {
  for (const path of [
    `/app/${slug}/packages`,
    `/owner-dashboard-preview/${slug}/packages`,
  ]) {
    try { revalidatePath(path); } catch { /* Persistence already committed. */ }
  }
  try { revalidateTag(tenantCacheTags.packagesByBusiness(businessId), "max"); } catch { /* Persistence already committed. */ }
}

export async function createPackageAction(params: CreatePackageInput) {
  const parsed = createPackageSchema.safeParse(params);
  if (!parsed.success) return { success: false as const, error: "Invalid input" };
  try {
    const sessionAuth = await requireAuth();
    if (!sessionAuth.success) return sessionAuth;
    const auth = await requireStaffPermission(sessionAuth.businessSlug, StaffPermission.CATALOG_MANAGE, { write: true });
    if (!auth.success) return auth;
    if (parsed.data.businessSlug !== auth.context.businessSlug) return { success: false as const, error: "Unauthorized operation for this business." };
    const result = await createCatalogPackage(auth.context, parsed.data);
    if (result.success) {
      invalidatePackages(auth.context.businessSlug, auth.context.businessId);
    }
    return result;
  } catch { return { success: false as const, error: "Failed to create package" }; }
}

export async function updatePackageAction(packageId: number, params: PackageDetails) {
  const id = packageIdSchema.safeParse(packageId);
  const parsed = packageDetailsSchema.safeParse(params);
  if (!id.success || !parsed.success) return { success: false as const, error: "Invalid input" };
  try {
    const sessionAuth = await requireAuth();
    if (!sessionAuth.success) return sessionAuth;
    const auth = await requireStaffPermission(sessionAuth.businessSlug, StaffPermission.CATALOG_MANAGE, { write: true });
    if (!auth.success) return auth;
    const result = await replaceCatalogPackage(auth.context, id.data, parsed.data);
    if (result.success) {
      invalidatePackages(auth.context.businessSlug, auth.context.businessId);
    }
    return result;
  } catch { return { success: false as const, error: "Failed to update package" }; }
}

export async function deletePackageAction(packageId: number) {
  const id = packageIdSchema.safeParse(packageId);
  if (!id.success) return { success: false as const, error: "Invalid input" };
  try {
    const sessionAuth = await requireAuth();
    if (!sessionAuth.success) return sessionAuth;
    const auth = await requireStaffPermission(sessionAuth.businessSlug, StaffPermission.CATALOG_MANAGE, { write: true });
    if (!auth.success) return auth;
    const result = await deleteCatalogPackage(auth.context, id.data);
    if (result.success) {
      invalidatePackages(auth.context.businessSlug, auth.context.businessId);
    }
    return result;
  } catch { return { success: false as const, error: "Failed to delete package" }; }
}
