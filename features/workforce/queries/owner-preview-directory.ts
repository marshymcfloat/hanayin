import "server-only";

import type { Prisma } from "@/prisma/generated/prisma/client";
import { OwnerPermission, Role } from "@/prisma/generated/prisma/enums";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import { prisma } from "@/prisma/prisma";
import type { OwnerPreviewEmployeesData, OwnerPreviewOwnersData } from "@/features/workforce/types/owner-preview-directory";

type DirectoryDatabase = Pick<Prisma.TransactionClient, "business">;

function verifiedOwnerWhere(actor: OwnerActorContext): Prisma.BusinessWhereInput {
  return {
    id: actor.businessId,
    slug: actor.businessSlug,
    owners: {
      some: {
        id: actor.ownerId,
        user_id: actor.userId,
        business_id: actor.businessId,
        user: { role: Role.OWNER },
      },
    },
  };
}

export async function getOwnerPreviewEmployees(
  actor: OwnerActorContext,
  db: DirectoryDatabase = prisma,
): Promise<OwnerPreviewEmployeesData | null> {
  const business = await db.business.findFirst({
    where: verifiedOwnerWhere(actor),
    select: {
      name: true,
      owners: { where: { id: actor.ownerId, user_id: actor.userId }, select: { permissions: true } },
      employees: {
        where: { archived_at: null },
        orderBy: { user: { name: "asc" } },
        select: {
          id: true,
          profile: true,
          specialties: true,
          recurring_days_off: true,
          user: { select: { name: true, contact_number: true } },
        },
      },
    },
  });
  if (!business) return null;

  return {
    businessName: business.name,
    canManagePay: Boolean(business.owners?.[0]?.permissions.includes(OwnerPermission.PAYROLL_MANAGE)),
    employees: business.employees.map((employee) => ({
      id: employee.id,
      name: employee.user.name,
      contactNumber: employee.user.contact_number,
      profile: employee.profile,
      specialties: employee.specialties,
      recurringDaysOff: employee.recurring_days_off,
    })),
  };
}

export async function getOwnerPreviewOwners(
  actor: OwnerActorContext,
  db: DirectoryDatabase = prisma,
): Promise<OwnerPreviewOwnersData | null> {
  const business = await db.business.findFirst({
    where: verifiedOwnerWhere(actor),
    select: {
      name: true,
      services: { where: { business_id: actor.businessId }, select: { category: true }, distinct: ["category"], orderBy: { category: "asc" } },
      owners: {
        where: { business_id: actor.businessId, user: { role: Role.OWNER } },
        orderBy: { user: { name: "asc" } },
        select: {
          id: true,
          is_primary: true,
          specialties: true,
          permissions: true,
          user: { select: { name: true, contact_number: true } },
        },
      },
    },
  });
  if (!business) return null;

  return {
    businessName: business.name,
    administration: {
      currentOwnerId: actor.ownerId,
      canManage: business.owners.some(owner => owner.id === actor.ownerId && owner.permissions.includes(OwnerPermission.SETTINGS_MANAGE)),
      categories: business.services.map(service => service.category),
    },
    owners: business.owners.map((owner) => ({
      id: owner.id,
      name: owner.user.name,
      contactNumber: owner.user.contact_number,
      isPrimary: owner.is_primary,
      specialties: owner.specialties,
      permissions: owner.permissions,
    })),
  };
}
