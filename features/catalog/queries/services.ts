import { requireStaffPermission } from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export async function getServicesWorkspaceData(businessSlug: string) {
  const access = await requireStaffPermission(businessSlug, StaffPermission.CATALOG_MANAGE);
  if (!access.success) return access;
  const services = await prisma.service.findMany({
    where: { business_id: access.context.businessId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { flow_triggers: true },
  });
  return { success: true as const, services, categories: [...new Set(services.map(({ category }) => category))] };
}
