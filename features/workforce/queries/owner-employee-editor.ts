import "server-only";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { prisma } from "@/prisma/prisma";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import { getDefaultPermissionsForProfile, sanitizeStaffPermissions } from "@/lib/auth/staff-access";

// Separate from the cached directory: compensation and access are read only for an open editor.
export async function getOwnerEmployeeEditor(actor: OwnerActorContext, db: Pick<Prisma.TransactionClient, "business"> = prisma) {
  const business = await db.business.findFirst({
    where: { id: actor.businessId, slug: actor.businessSlug, owners: { some: { id: actor.ownerId, user_id: actor.userId, business_id: actor.businessId, user: { role: "OWNER" }, permissions: { has: "EMPLOYEES_MANAGE" } } } },
    select: {
      owners: { where: { id: actor.ownerId }, select: { permissions: true } },
      services: { select: { category: true }, distinct: ["category"] },
      employees: { where: { business_id: actor.businessId, archived_at: null, user: { role: "EMPLOYEE", owner: { is: null } } }, select: {
        id: true, profile: true, permissions: true, specialties: true, recurring_days_off: true, employment_start: true, financial_revision: true,
        user: { select: { name: true, contact_number: true } },
      } },
    },
  });
  if (!business) return null;
  return {
    canManageCompensation: false,
    canManagePayroll: Boolean(business.owners?.[0]?.permissions.includes("PAYROLL_MANAGE")),
    categories: business.services.map(service => service.category).filter(category => category.toLowerCase() !== "general").sort((a, b) => a.localeCompare(b)),
    defaults: { STAFF: getDefaultPermissionsForProfile("STAFF"), MANAGER: getDefaultPermissionsForProfile("MANAGER"), CASHIER: getDefaultPermissionsForProfile("CASHIER") },
    employees: business.employees.map(employee => ({ id: employee.id, name: employee.user.name, contact_number: employee.user.contact_number, profile: employee.profile,
      permissions: sanitizeStaffPermissions(employee.profile, employee.permissions), daily_rate: null as number | null, commission_percentage: null as number | null,
      employment_start: employee.employment_start?.toISOString().slice(0, 10) ?? null, financialRevision: employee.financial_revision,
      specialties: employee.specialties, recurring_days_off: employee.recurring_days_off })),
  };
}

export type OwnerEmployeeEditorData = NonNullable<Awaited<ReturnType<typeof getOwnerEmployeeEditor>>>;
