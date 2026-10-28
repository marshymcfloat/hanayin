import "server-only";
import { put, del } from "@vercel/blob";
import { prisma } from "@/prisma/prisma";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import { brandAssetExtension, type BrandAssetUpload } from "@/features/assets/brand-asset-schemas";
import type { BrandAssetResult, BrandAssetView } from "@/features/assets/brand-asset-types";
import { Role } from "@/prisma/generated/prisma/enums";
import { assertBrandAssetReferences, brandAssetFailure, persistBrandAsset, removeBrandAsset } from "@/features/assets/services/brand-assets";
export async function uploadTenantBrandAsset(context: OwnerActorContext, input: BrandAssetUpload): Promise<BrandAssetResult<BrandAssetView>> {
  if (context.actorType !== "OWNER" || context.role !== Role.OWNER) return { success: false, error: "Forbidden" };
  try { await assertBrandAssetReferences(prisma, context.businessId, input); }
  catch (error) { return { success: false, error: brandAssetFailure(error, "Failed to save asset.") }; }
  const extension = brandAssetExtension(input.file.type);
  if (!extension) return { success: false, error: "Could not infer file extension." };
  let blob;
  try { blob = await put(`${context.businessSlug}/brand/${input.kind.toLowerCase()}/${Date.now()}.${extension}`, input.file, { access: "public", addRandomSuffix: true, contentType: input.file.type }); }
  catch { return { success: false, error: "Upload failed." }; }
  try { return { success: true, data: await persistBrandAsset(context, input, blob) }; }
  catch (error) { await del(blob.url).catch(() => {}); return { success: false, error: brandAssetFailure(error, "Failed to save asset.") }; }
}
export async function deleteTenantBrandAsset(context: OwnerActorContext, assetId: string): Promise<BrandAssetResult> {
  let asset;
  try { asset = await removeBrandAsset(context, assetId); }
  catch (error) { return { success: false, error: brandAssetFailure(error, "Failed to delete asset.") }; }
  await del(asset.url).catch(() => {}); return { success: true };
}
