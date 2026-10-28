import "server-only";
import { hasCurrentCatalogWriteAccess } from "@/features/catalog/catalog-access";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import type { PackageDetails } from "@/features/catalog/package-schemas";
import type { PackageResult } from "@/features/catalog/package-administration-types";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { validateOfferRules } from "@/features/catalog/services/offer-rule-validation";
import { readPackageChoices } from "@/features/catalog/offer-definitions";
import { startOfMonthPh, toPackageMutationData, type CatalogDeleteData, type PackageMutationData } from "@/features/catalog/catalog-mutation-dtos";

type CatalogActor = Extract<TenantActorContext, { success: true }>;
const packageSelect = {
  id: true, name: true, description: true, price: true, duration: true, choices: true, revision: true,
  category: true, business_id: true, created_at: true, updated_at: true,
} satisfies Prisma.ServicePackageSelect;
const transactionOptions = { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 } as const;
const denial = (error: string) => ({ success: false as const, error });
const invalidServices = "One or more package services are invalid for this business.";
const missingPackage = "Package not found or unauthorized";

async function validServices(tx: Prisma.TransactionClient, context: CatalogActor, items: PackageDetails["items"]) {
  if (items.length === 0) return true;
  const serviceIds = [...new Set(items.map(item => item.serviceId))];
  const count = await tx.service.count({ where: { business_id: context.businessId, id: { in: serviceIds } } });
  return count === serviceIds.length;
}

function scalarDetails(input: PackageDetails) {
  return { name: input.name, description: input.description, price: input.price, duration: input.duration, category: input.category, ...(input.choices === undefined ? {} : { choices: input.choices }) };
}

function packageMutationSelect(now: Date, businessId: string) {
  return {
    ...packageSelect,
    items: {
      where: { service: { business_id: businessId } },
      select: {
        custom_price: true,
        service: {
          select: { id: true, name: true, category: true, duration: true, price: true },
        },
      },
      orderBy: { service: { name: "asc" as const } },
    },
    availed_services: {
      where: {
        created_at: { gte: startOfMonthPh(now), lte: now },
        status: { not: "CANCELLED" as const },
        booking: {
          business_id: businessId,
          status: { in: ["ACCEPTED" as const, "COMPLETED" as const] },
        },
      },
      select: { booking_id: true },
    },
  } satisfies Prisma.ServicePackageSelect;
}

function failure(error: unknown, fallback: string) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  return denial(code === "P2034" ? "Package settings changed. Refresh and try again." : fallback);
}

export async function createCatalogPackage(context: CatalogActor, input: PackageDetails): Promise<PackageResult<PackageMutationData>> {
  try {
    const now = new Date();
    return await prisma.$transaction(async tx => {
      if (!await hasCurrentCatalogWriteAccess(tx, context)) return denial("Forbidden");
      if (!await validServices(tx, context, input.items)) return denial(invalidServices);
      await validateOfferRules(tx, context.businessId, (input.choices ?? []).map(choice => choice.rule));
      const record = await tx.servicePackage.create({
        data: {
          ...scalarDetails(input), business_id: context.businessId,
          items: { create: input.items.map(item => ({ service_id: item.serviceId, custom_price: item.customPrice })) },
        }, select: packageMutationSelect(now, context.businessId),
      });
      return { success: true as const, data: toPackageMutationData(record) };
    }, transactionOptions);
  } catch (error) { return failure(error, "Failed to create package"); }
}

export async function replaceCatalogPackage(context: CatalogActor, packageId: number, input: PackageDetails): Promise<PackageResult<PackageMutationData>> {
  try {
    const now = new Date();
    return await prisma.$transaction(async tx => {
      if (!await hasCurrentCatalogWriteAccess(tx, context)) return denial("Forbidden");
      const target = await tx.servicePackage.findFirst({ where: { id: packageId, business_id: context.businessId }, select: { id: true, revision: true, choices: true } });
      if (!target) return denial(missingPackage);
      if (input.expectedRevision !== undefined && input.expectedRevision !== target.revision || readPackageChoices(target.choices).length && input.expectedRevision === undefined) return denial("Package settings changed. Refresh before editing this package.");
      if (!await validServices(tx, context, input.items)) return denial(invalidServices);
      await validateOfferRules(tx, context.businessId, (input.choices ?? []).map(choice => choice.rule));
      if (input.choices?.length && await tx.giftCardPackage.count({ where: { package_id: packageId, package: { business_id: context.businessId }, gift_card: { is_claimed: false, expires_at: { gte: now } } } })) return denial("This package has outstanding gift cards. Duplicate it to create a package with choices.");
      await tx.servicePackage.update({
        where: { id: target.id, business_id: context.businessId, ...(input.expectedRevision === undefined ? {} : { revision: input.expectedRevision }) }, data: { ...scalarDetails(input), revision: { increment: 1 } }, select: { id: true },
      });
      await tx.packageItem.deleteMany({ where: { package_id: target.id, package: { business_id: context.businessId } } });
      if (input.items.length > 0) {
        await tx.packageItem.createMany({ data: input.items.map(item => ({ package_id: target.id, service_id: item.serviceId, custom_price: item.customPrice })) });
      }
      const record = await tx.servicePackage.findFirst({
        where: { id: target.id, business_id: context.businessId },
        select: packageMutationSelect(now, context.businessId),
      });
      if (!record) return denial(missingPackage);
      return { success: true as const, data: toPackageMutationData(record) };
    }, transactionOptions);
  } catch (error) { return failure(error, "Failed to update package"); }
}

export async function deleteCatalogPackage(context: CatalogActor, packageId: number): Promise<PackageResult<CatalogDeleteData>> {
  try {
    return await prisma.$transaction(async tx => {
      if (!await hasCurrentCatalogWriteAccess(tx, context)) return denial("Forbidden");
      const target = await tx.servicePackage.findFirst({ where: { id: packageId, business_id: context.businessId }, select: { id: true } });
      if (!target) return denial(missingPackage);
      await tx.servicePackage.delete({ where: { id: target.id, business_id: context.businessId }, select: { id: true } });
      return { success: true as const, data: { id: target.id } };
    }, transactionOptions);
  } catch (error) { return failure(error, "Failed to delete package"); }
}
