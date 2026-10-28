import { requireTenantAccess } from "@/lib/auth/guards";
import { PayslipStatus } from "@/prisma/generated/prisma/client";
import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { publicUserSelect, toPublicUser } from "@/lib/auth/public-user";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { getPayrollOwnerBusinessId } from "@/features/payroll/payroll-access";

export async function getPayrollWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) return { success: false as const, error: "Forbidden" };
  const actor = await resolveTenantActorContext(businessSlug, auth.session.user.id);
  if (!actor.success || actor.actorType !== "OWNER") return { success: false as const, error: "Forbidden" };
  if (await getPayrollOwnerBusinessId(businessSlug, auth.session.user.id) !== actor.businessId) {
    return { success: false as const, error: "Forbidden" };
  }
  const employees = await prisma.employee.findMany({
    where: { business_id: actor.businessId },
    include: { user: { select: publicUserSelect }, payslips: { where: { status: PayslipStatus.PAID }, orderBy: { ending_date: "desc" }, take: 1 } },
    orderBy: { user: { name: "asc" } },
  });
  return { success: true as const, employees: employees.map((employee) => ({ ...employee, user: toPublicUser(employee.user) })) };
}
