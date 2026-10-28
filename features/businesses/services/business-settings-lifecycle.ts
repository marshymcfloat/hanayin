import "server-only";
import { put, del } from "@vercel/blob";
import { extractQrCodePng, QrImageError } from "@/lib/services/qr-image";
import { prisma } from "@/prisma/prisma";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import { businessSettingsWhere } from "@/features/businesses/business-settings-access";
import type { BusinessSettingsInput } from "@/features/businesses/business-settings-types";
import { persistBusinessSettings, BusinessSettingsError } from "@/features/businesses/services/business-settings";
export async function updateTenantBusinessSettings(context: OwnerActorContext, input: BusinessSettingsInput): Promise<void> {
  let where;
  try { where = businessSettingsWhere(context); } catch { throw new BusinessSettingsError("Forbidden"); }
  if (!await prisma.business.findFirst({ where, select: { id: true } })) throw new BusinessSettingsError("Forbidden");
  const uploaded: string[] = [];
  let imageUrl = input.existingImageUrl;
  let gcashQrImageUrl = input.existingGcashQrImageUrl;
  try {
    if (input.gcashQrImageFile) {
      try {
        const cropped = await extractQrCodePng(input.gcashQrImageFile);
        const blob = await put(`${context.businessSlug}/payments/gcash-qr-${Date.now()}.png`, cropped, { access: "public", addRandomSuffix: true, contentType: "image/png" });
        uploaded.push(blob.url); gcashQrImageUrl = blob.url;
      } catch (error) { throw new BusinessSettingsError(error instanceof QrImageError ? error.message : "Failed to process the GCash QR image."); }
    }
    if (input.imageFile) {
      try {
        const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[input.imageFile.type];
        const blob = await put(`${context.businessSlug}/business/image-${Date.now()}.${extension}`, input.imageFile, { access: "public", addRandomSuffix: true, contentType: input.imageFile.type });
        uploaded.push(blob.url); imageUrl = blob.url;
      } catch { throw new BusinessSettingsError("Failed to upload image. Please check your storage configuration."); }
    }
    await persistBusinessSettings(context, input, { imageUrl, gcashQrImageUrl });
  } catch (error) {
    for (const url of uploaded) { try { await del(url); } catch { /* Cleanup is best effort, not a distributed transaction. */ } }
    throw error;
  }
}
