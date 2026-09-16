import { requireTenantAccess } from "@/lib/auth/guards";
import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

export async function getAttendanceWorkspaceContext(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  const business = await prisma.business.findUnique({ where: { slug: businessSlug }, select: { id: true } });
  if (!business) return { success: false as const, error: "Not found" };
  if (auth.session.user.role === Role.OWNER) {
    return { success: true as const, data: { role: Role.OWNER, businessId: business.id } };
  }
  if (auth.session.user.role !== Role.EMPLOYEE) {
    return {
      success: true as const,
      data: { role: auth.session.user.role, businessId: business.id },
    };
  }
  const employee = await prisma.employee.findFirst({ where: { user_id: auth.session.user.id, business_id: business.id }, select: { id: true } });
  return {
    success: true as const,
    data: {
      role: Role.EMPLOYEE,
      businessId: business.id,
      employeeId: employee?.id ?? null,
    },
  };
}
