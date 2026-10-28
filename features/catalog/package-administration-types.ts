import type { ServicePackage } from "@/prisma/generated/prisma/client";

export type PackageRecord = ServicePackage;
export type PackageWithBusiness = PackageRecord & { business: { id: string; slug: string } };
export type PackageResult<T> = { success: true; data: T } | { success: false; error: string };
