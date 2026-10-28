import "server-only";
import { prisma } from "@/prisma/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import type { OwnerPermission } from "@/prisma/generated/prisma/enums";
import { PayrollError, type PayrollIdentity } from "./contracts";

export async function payrollOwner(identity: PayrollIdentity, db: Prisma.TransactionClient = prisma, permission: OwnerPermission = "PAYROLL_MANAGE") {
  const owner = await db.owner.findFirst({
    where: { user_id: identity.userId, user: { role: "OWNER" }, business: { slug: identity.businessSlug }, permissions: { has: permission } },
    select: { id: true, business_id: true },
  });
  if (!owner) throw new PayrollError("FORBIDDEN", "Your access has changed. Sign in again or ask an authorized owner.");
  return { ...identity, businessId: owner.business_id, ownerId: owner.id };
}
export async function payrollSelf(identity: PayrollIdentity, db: Prisma.TransactionClient = prisma) {
  const employee = await db.employee.findFirst({
    where: { user_id: identity.userId, user: { role: "EMPLOYEE" }, business: { slug: identity.businessSlug }, archived_at: null },
    select: { id: true, business_id: true },
  });
  if (!employee) throw new PayrollError("FORBIDDEN", "Employee access is unavailable.");
  return { ...identity, businessId: employee.business_id, employeeId: employee.id };
}
