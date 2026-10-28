"use server";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedOwnerPermission } from "@/lib/auth/owner-access";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";
import { requireBrandAssetReadAccess } from "@/features/assets/brand-asset-access";
import { brandAssetIdSchema, brandAssetKindSchema, parseBrandAssetUpload } from "@/features/assets/brand-asset-schemas";
import { listTenantBrandAssets } from "@/features/assets/queries/brand-assets";
import { uploadTenantBrandAsset, deleteTenantBrandAsset } from "@/features/assets/services/brand-asset-lifecycle";
export async function listBrandAssetsAction(kind?: string) {
  const parsed = brandAssetKindSchema.safeParse(kind);
  if (!parsed.success) return { success: false as const, error: "Invalid asset kind." };
  try {
    const access = await requireBrandAssetReadAccess(); if (!access.success) return access;
    return { success: true as const, data: await listTenantBrandAssets(access.context, parsed.data) };
  } catch { return { success: false as const, error: "Failed to load assets." }; }
}
export async function uploadBrandAssetAction(formData: FormData) {
  const parsed = parseBrandAssetUpload(formData); if (!parsed.success) return parsed;
  try {
    const access = await requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE); if (!access.success) return access;
    const result = await uploadTenantBrandAsset(access.context, parsed.data);
    if (result.success) { try { revalidatePath(`/app/${access.context.businessSlug}/business`); } catch { /* The asset is already committed. */ } }
    return result;
  } catch { return { success: false as const, error: "Failed to save asset." }; }
}
export async function deleteBrandAssetAction(assetId: string) {
  const parsed = brandAssetIdSchema.safeParse(assetId); if (!parsed.success) return { success: false as const, error: "Invalid asset ID." };
  try {
    const access = await requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE); if (!access.success) return access;
    const result = await deleteTenantBrandAsset(access.context, parsed.data);
    if (result.success) { try { revalidatePath(`/app/${access.context.businessSlug}/business`); } catch { /* The deletion is already committed. */ } }
    return result;
  } catch { return { success: false as const, error: "Failed to delete asset." }; }
}
