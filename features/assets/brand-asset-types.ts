import type { BrandAssetKind, ReferenceSubject } from "@/prisma/generated/prisma/enums";
import type { TenantActorContext } from "@/lib/auth/staff-access";
export type BrandAssetActor = Extract<TenantActorContext, { success: true }>;
export type BrandAssetView = { id: string; kind: BrandAssetKind; reference_subject: ReferenceSubject | null; url: string; alt: string | null; service_id: number | null; employee_id: number | null; created_at: Date };
export type BrandAssetResult<T = undefined> = { success: false; error: string } | (T extends undefined ? { success: true } : { success: true; data: T });
