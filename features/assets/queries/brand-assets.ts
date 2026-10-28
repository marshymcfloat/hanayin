import "server-only";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { BrandAssetKind } from "@/prisma/generated/prisma/enums";
import { brandAssetBusinessWhere } from "@/features/assets/brand-asset-access";
import type { BrandAssetActor, BrandAssetView } from "@/features/assets/brand-asset-types";
export const brandAssetViewSelect = { id: true, kind: true, reference_subject: true, url: true, alt: true, service_id: true, employee_id: true, created_at: true } satisfies Prisma.BrandAssetSelect;
export async function listTenantBrandAssets(context: BrandAssetActor, kind?: BrandAssetKind): Promise<BrandAssetView[]> {
  return prisma.brandAsset.findMany({ where: { business_id: context.businessId, business: brandAssetBusinessWhere(context), ...(kind ? { kind } : {}) }, orderBy: [{ kind: "asc" }, { created_at: "desc" }], select: brandAssetViewSelect });
}
