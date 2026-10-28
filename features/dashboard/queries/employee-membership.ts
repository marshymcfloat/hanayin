import "server-only";

import type { TenantActorContext } from "@/lib/auth/staff-access";
import { prisma } from "@/prisma/prisma";

export async function getEmployeeDashboardMembership(
  context: Extract<TenantActorContext, { success: true; actorType: "EMPLOYEE" }>,
) {
  return prisma.employee.findFirst({
    where: {
      id: context.employeeId,
      business_id: context.businessId,
      user_id: context.userId,
    },
    select: { id: true, specialties: true },
  });
}
