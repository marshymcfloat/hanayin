import "server-only";
import { requireTenantAccess } from "@/lib/auth/guards";
import { OwnerPermission, Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { publicUserSelect, toPublicUser } from "@/lib/auth/public-user";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";

export async function getEmployeesWorkspaceData(businessSlug: string) {
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) return { success: false as const, error: "Forbidden" };
  const actor = await resolveTenantActorContext(businessSlug, auth.session.user.id);
  if (!actor.success || actor.actorType !== "OWNER") return { success: false as const, error: "Forbidden" };
  const ownerWhere = { id: actor.ownerId, business_id: actor.businessId, user_id: actor.userId, user: { role: Role.OWNER }, permissions: { has: OwnerPermission.EMPLOYEES_MANAGE } };
  const owner = await prisma.owner.findFirst({ where: ownerWhere, select: { permissions: true } });
  if (!owner) return { success: false as const, error: "Forbidden" };
  const canAccessPayroll = owner.permissions.includes(OwnerPermission.PAYROLL_MANAGE);
  const settings = await prisma.payrollSettings.findUnique({ where: { business_id: actor.businessId }, select: { mode: true } });
  const canManageCompensation = canAccessPayroll && (!settings || settings.mode === "LEGACY");
  const membership = { owners: { some: ownerWhere } };
  const attendanceCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const employeeWhere = { business_id: actor.businessId, archived_at: null, user: { role: Role.EMPLOYEE }, business: membership };
  const [employees, compensation, serviceCategories] = await Promise.all([
    prisma.employee.findMany({ where: employeeWhere, select: {
      id: true, user_id: true, business_id: true, profile: true, permissions: true, specialties: true, recurring_days_off: true, is_demo: true,
      employment_start: true, employment_end: true, archived_at: true, financial_revision: true,
      user: { select: publicUserSelect }, attendance: { where: { date: { gte: attendanceCutoff } }, orderBy: { date: "desc" }, take: 7 },
      _count: { select: { served_services: true } },
    }, orderBy: { user: { name: "asc" } } }),
    canManageCompensation ? prisma.employee.findMany({ where: { ...employeeWhere, business: { owners: { some: { ...ownerWhere, permissions: { hasEvery: [OwnerPermission.EMPLOYEES_MANAGE, OwnerPermission.PAYROLL_MANAGE] } } } } }, select: { id: true, salary: true, daily_rate: true, commission_percentage: true, payslips: { orderBy: { ending_date: "desc" }, take: 1 } } }) : Promise.resolve([]),
    prisma.service.findMany({ where: { business_id: actor.businessId, business: membership }, select: { category: true }, distinct: ["category"] }),
  ]);
  const currentActor = await resolveTenantActorContext(businessSlug, auth.session.user.id);
  const currentOwner = await prisma.owner.findFirst({ where: ownerWhere, select: { permissions: true } });
  const currentSettings = await prisma.payrollSettings.findUnique({ where: { business_id: actor.businessId }, select: { mode: true } });
  if (!currentActor.success || currentActor.actorType !== "OWNER" || currentActor.businessId !== actor.businessId || currentActor.ownerId !== actor.ownerId || !currentOwner || currentOwner.permissions.includes(OwnerPermission.PAYROLL_MANAGE) !== canAccessPayroll || (currentSettings?.mode ?? "LEGACY") !== (settings?.mode ?? "LEGACY")) return { success: false as const, error: "Forbidden" };
  const privateRecords = new Map(compensation.map(entry => [entry.id, entry]));
  const categories = serviceCategories.map(({ category }) => category).filter(category => category.toLowerCase() !== "general").sort((a, b) => a.localeCompare(b));
  return { success: true as const, canAccessPayroll, canManageCompensation, employees: employees.map(employee => {
    const privateRecord = privateRecords.get(employee.id);
    return { ...employee, salary: privateRecord?.salary ?? null, daily_rate: privateRecord?.daily_rate ?? null, commission_percentage: privateRecord?.commission_percentage ?? null, payslips: privateRecord?.payslips ?? [], user: toPublicUser(employee.user) };
  }), categories };
}
export type EmployeesWorkspaceEmployee = Extract<Awaited<ReturnType<typeof getEmployeesWorkspaceData>>, { success: true }> ["employees"][number];
