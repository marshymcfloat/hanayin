"use server";

import { prisma } from "@/prisma/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { tenantCacheTags } from "@/lib/data/cached";
import { requireStaffPermission } from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";

interface PackageItemInput {
  serviceId: number;
  customPrice: number;
}

interface CreatePackageParams {
  name: string;
  description?: string;
  price: number;
  duration?: number;
  category: string;
  businessSlug: string;
  items: PackageItemInput[];
}

interface UpdatePackageParams {
  name: string;
  description?: string;
  price: number;
  duration?: number;
  category: string;
  items: PackageItemInput[];
}

async function hasInvalidPackageItems(
  businessId: string,
  items: PackageItemInput[],
) {
  if (items.length === 0) return false;

  const uniqueServiceIds = Array.from(
    new Set(items.map((item) => item.serviceId)),
  );

  const count = await prisma.service.count({
    where: {
      business_id: businessId,
      id: {
        in: uniqueServiceIds,
      },
    },
  });

  return count !== uniqueServiceIds.length;
}

export async function createPackageAction(params: CreatePackageParams) {
  const sessionAuth = await requireAuth();
  if (!sessionAuth.success) return sessionAuth;
  const auth = await requireStaffPermission(
    sessionAuth.businessSlug,
    StaffPermission.CATALOG_MANAGE,
    { write: true },
  );
  if (!auth.success) return auth;
  const { businessSlug } = auth.context;

  if (params.businessSlug !== businessSlug) {
    return {
      success: false,
      error: "Unauthorized operation for this business.",
    };
  }

  try {
    const business = await prisma.business.findUnique({
      where: { slug: params.businessSlug },
      select: { id: true, slug: true },
    });

    if (!business) {
      return { success: false, error: "Business not found" };
    }

    if (await hasInvalidPackageItems(business.id, params.items)) {
      return {
        success: false,
        error: "One or more package services are invalid for this business.",
      };
    }

    const { items, businessSlug, ...packageData } = params;

    const newPackage = await prisma.servicePackage.create({
      data: {
        ...packageData,
        business_id: business.id,
        items: {
          create: items.map((item) => ({
            service_id: item.serviceId,
            custom_price: item.customPrice,
          })),
        },
      },
    });

    revalidatePath(`/app/${businessSlug}/packages`);
    revalidateTag(tenantCacheTags.packagesByBusiness(business.id), "max");
    return { success: true, data: newPackage };
  } catch (error) {
    console.error("Error creating package:", error);
    return { success: false, error: "Failed to create package" };
  }
}

export async function updatePackageAction(
  packageId: number,
  params: UpdatePackageParams,
) {
  const sessionAuth = await requireAuth();
  if (!sessionAuth.success) return sessionAuth;
  const auth = await requireStaffPermission(
    sessionAuth.businessSlug,
    StaffPermission.CATALOG_MANAGE,
    { write: true },
  );
  if (!auth.success) return auth;
  const { businessSlug } = auth.context;

  try {
    const existingPackage = await prisma.servicePackage.findUnique({
      where: { id: packageId },
      select: { business: { select: { id: true, slug: true } } },
    });

    if (!existingPackage || existingPackage.business.slug !== businessSlug) {
      return { success: false, error: "Package not found or unauthorized" };
    }

    const { items, ...packageData } = params;

    if (
      await hasInvalidPackageItems(
        existingPackage.business.id,
        items,
      )
    ) {
      return {
        success: false,
        error: "One or more package services are invalid for this business.",
      };
    }

    const updatedPackage = await prisma.$transaction(async (tx) => {
      const pkg = await tx.servicePackage.update({
        where: { id: packageId },
        data: packageData,
        include: {
          business: {
            select: { id: true, slug: true },
          },
        },
      });

      await tx.packageItem.deleteMany({
        where: { package_id: packageId },
      });

      if (items.length > 0) {
        await tx.packageItem.createMany({
          data: items.map((item) => ({
            package_id: packageId,
            service_id: item.serviceId,
            custom_price: item.customPrice,
          })),
        });
      }

      return pkg;
    });

    revalidatePath(`/app/${updatedPackage.business.slug}/packages`);
    revalidateTag(
      tenantCacheTags.packagesByBusiness(updatedPackage.business.id),
      "max",
    );
    return { success: true, data: updatedPackage };
  } catch (error) {
    console.error("Error updating package:", error);
    return { success: false, error: "Failed to update package" };
  }
}

export async function deletePackageAction(packageId: number) {
  const sessionAuth = await requireAuth();
  if (!sessionAuth.success) return sessionAuth;
  const auth = await requireStaffPermission(
    sessionAuth.businessSlug,
    StaffPermission.CATALOG_MANAGE,
    { write: true },
  );
  if (!auth.success) return auth;
  const { businessSlug } = auth.context;

  try {
    // Verify ownership
    const existingPackage = await prisma.servicePackage.findUnique({
      where: { id: packageId },
      select: { business: { select: { slug: true } } },
    });

    if (!existingPackage || existingPackage.business.slug !== businessSlug) {
      return { success: false, error: "Package not found or unauthorized" };
    }

    const deletedPackage = await prisma.servicePackage.delete({
      where: { id: packageId },
      include: {
        business: {
          select: { id: true, slug: true },
        },
      },
    });

    revalidatePath(`/app/${deletedPackage.business.slug}/packages`);
    revalidateTag(
      tenantCacheTags.packagesByBusiness(deletedPackage.business.id),
      "max",
    );
    return { success: true, data: deletedPackage };
  } catch (error) {
    console.error("Error deleting package:", error);
    return { success: false, error: "Failed to delete package" };
  }
}
