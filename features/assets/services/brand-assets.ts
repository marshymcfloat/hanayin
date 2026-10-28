import "server-only";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import { brandAssetOwnerWhere } from "@/features/assets/brand-asset-access";
import { brandAssetViewSelect } from "@/features/assets/queries/brand-assets";
import type { BrandAssetUpload } from "@/features/assets/brand-asset-schemas";
import type { BrandAssetView } from "@/features/assets/brand-asset-types";
import { Role } from "@/prisma/generated/prisma/enums";
export class BrandAssetError extends Error {}
const options = { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 } as const;
export async function assertBrandAssetReferences(db: Pick<Prisma.TransactionClient, "service" | "employee">, businessId: string, input: BrandAssetUpload) {
  if (input.serviceId !== null && !await db.service.findFirst({ where: { id: input.serviceId, business_id: businessId }, select: { id: true } })) throw new BrandAssetError("Service not found.");
  if (input.employeeId !== null && !await db.employee.findFirst({ where: { id: input.employeeId, business_id: businessId }, select: { id: true } })) throw new BrandAssetError("Employee not found.");
}
async function assertOwner(tx: Prisma.TransactionClient, context: OwnerActorContext) {
  if (!await tx.owner.findFirst({ where: brandAssetOwnerWhere(context), select: { id: true } })) throw new BrandAssetError("Forbidden");
}
export async function persistBrandAsset(context: OwnerActorContext, input: BrandAssetUpload, blob: { url: string; pathname: string }): Promise<BrandAssetView> {
  if (context.actorType !== "OWNER" || context.role !== Role.OWNER) throw new BrandAssetError("Forbidden");
  return prisma.$transaction(async tx => {
    await assertOwner(tx, context); await assertBrandAssetReferences(tx, context.businessId, input);
    return tx.brandAsset.create({ data: { business_id: context.businessId, kind: input.kind, reference_subject: input.referenceSubject, alt: input.alt, service_id: input.serviceId, employee_id: input.employeeId, uploaded_by_user_id: context.userId, url: blob.url, storage_key: blob.pathname }, select: brandAssetViewSelect });
  }, options);
}
export async function removeBrandAsset(context: OwnerActorContext, assetId: string): Promise<{ url: string }> {
  if (context.actorType !== "OWNER" || context.role !== Role.OWNER) throw new BrandAssetError("Forbidden");
  return prisma.$transaction(async tx => {
    await assertOwner(tx, context);
    const asset = await tx.brandAsset.findFirst({ where: { id: assetId, business_id: context.businessId }, select: { id: true, url: true } });
    if (!asset) throw new BrandAssetError("Asset not found");
    const deleted = await tx.brandAsset.deleteMany({ where: { id: asset.id, business_id: context.businessId, url: asset.url } });
    if (deleted.count !== 1) throw new BrandAssetError("Asset changed. Refresh and try again.");
    return { url: asset.url };
  }, options);
}
export function brandAssetFailure(error: unknown, fallback: string) {
  if (error instanceof BrandAssetError) return error.message;
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") return "Asset changed. Refresh and try again.";
  return fallback;
}
