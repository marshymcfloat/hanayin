import "server-only";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import type { EmployeePickerEntry } from "@/features/workforce/types/employee-picker";
import { prisma } from "@/prisma/prisma";

export async function getTenantEmployeePicker(context: Extract<TenantActorContext, { success: true }>): Promise<EmployeePickerEntry[]> {
  const employees = await prisma.employee.findMany({
    where: { business_id: context.businessId, archived_at: null },
    select: { id: true, profile: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return employees.map(employee => ({ id: employee.id, name: employee.user.name, profile: employee.profile }));
}
