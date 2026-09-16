import { requireStaffPermission } from "@/lib/auth/staff-access";
import { getCachedBusinessBySlug } from "@/lib/data/cached";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export async function getPackagesWorkspaceData(businessSlug: string) {
  const access = await requireStaffPermission(businessSlug, StaffPermission.CATALOG_MANAGE);
  if (!access.success) return access;
  const business = await getCachedBusinessBySlug(businessSlug);
  if (!business) return { success: false as const, error: "Not found" };
  const [packages, services, categories] = await Promise.all([
    prisma.servicePackage.findMany({
      where: { business_id: business.id },
      include: { items: { include: { service: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.service.findMany({
      where: { business_id: business.id },
      orderBy: { name: "asc" },
    }),
    prisma.service.groupBy({ by: ["category"], where: { business_id: business.id } })
      .then((groups) => groups.map(({ category }) => category)),
  ]);
  return { success: true as const, packages, services, categories };
}
