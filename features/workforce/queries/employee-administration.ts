import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import { publicUserSelect, toPublicUser } from "@/lib/auth/public-user";
import { resolveEmployeeAdministrationAccess } from "@/features/workforce/employee-administration-access";
import type { EmployeeAdministrationIdentity } from "@/features/workforce/employee-administration-types";

export async function getEmployeeAdministrationList(identity: EmployeeAdministrationIdentity) {
  try {
    const access = await resolveEmployeeAdministrationAccess(identity, false);
    if (!access) return { success: false as const, error: "Forbidden" };
    const businessId = access.actor.businessId;
    const payrollAccess = access.actor.actorType === "OWNER" && Boolean(await prisma.owner.findFirst({ where: { id: access.actor.ownerId!, user_id: identity.userId, business_id: businessId, user: { role: "OWNER" }, permissions: { has: "PAYROLL_MANAGE" } }, select: { id: true } }));
    const foreign = { business_id: { not: businessId } };
    const foreignWork: Prisma.AvailedServiceWhereInput = { OR: [{ booking: foreign }, { service: foreign }, { package: { is: foreign } }, { served_by: { is: foreign } }, { served_by_owner: { is: foreign } }, { paid_in_payslip: { is: { employee: foreign } } }] };
    const employees = await prisma.employee.findMany({ where: { business_id: businessId, business: access.business, archived_at: null }, include: {
      user: { select: publicUserSelect },
      attendance: { where: { OR: [{ paid_in_payslip_id: null }, { paid_in_payslip: { is: { employee: { business_id: businessId } } } }] }, orderBy: { date: "desc" }, take: 7 },
      payslips: { where: { NOT: { OR: [{ attendance_records: { some: { employee: foreign } } }, { availed_services: { some: foreignWork } }] } }, orderBy: { ending_date: "desc" }, take: 1 },
      _count: { select: { served_services: { where: { NOT: foreignWork } } } },
    }, orderBy: { user: { name: "asc" } } });
    return { success: true as const, data: employees.map(employee => ({ ...employee, ...(payrollAccess || employee.user_id === identity.userId ? {} : { salary: null, daily_rate: null, commission_percentage: null, payslips: [] }), user: toPublicUser(employee.user) })) };
  } catch { return { success: false as const, error: "Failed to fetch employees" }; }
}
export async function getEmployeeAdministrationSchedule(identity: EmployeeAdministrationIdentity, employeeId: number) {
  try {
    const access = await resolveEmployeeAdministrationAccess(identity, false);
    if (!access) return { success: false as const, error: "Forbidden" };
    const employee = { id: employeeId, business_id: access.actor.businessId, business: access.business };
    if (!await prisma.employee.findFirst({ where: employee, select: { id: true } })) return { success: false as const, error: "Employee not found" };
    const data = await prisma.employeeSchedule.findMany({ where: { employee_id: employeeId, employee }, orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }], select: { day_of_week: true, start_time: true, end_time: true } });
    return { success: true as const, data };
  } catch { return { success: false as const, error: "Failed to fetch schedule." }; }
}
