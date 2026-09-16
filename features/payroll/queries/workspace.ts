import { requireTenantAccess } from "@/lib/auth/guards";
import { getCachedBusinessBySlug } from "@/lib/data/cached";
import { PayslipStatus } from "@/prisma/generated/prisma/client";
import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export async function getPayrollWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) return { success: false as const, error: "Forbidden" };
  const business = await getCachedBusinessBySlug(businessSlug);
  if (!business) return { success: false as const, error: "Not found" };
  const employees = await prisma.employee.findMany({
    where: { business_id: business.id },
    include: { user: true, payslips: { where: { status: PayslipStatus.PAID }, orderBy: { ending_date: "desc" }, take: 1 } },
    orderBy: { user: { name: "asc" } },
  });
  return { success: true as const, employees };
}
