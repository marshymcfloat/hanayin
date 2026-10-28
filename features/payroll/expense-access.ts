import "server-only";

import { requireOwnerTenantWriteAccess, requireTenantAccess } from "@/lib/auth/guards";
import { resolveTenantActorContext, type TenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { Role } from "@/prisma/generated/prisma/enums";

export type ExpenseActorContext = Extract<TenantActorContext, { success: true }>;
export type ExpenseOwnerContext = Extract<ExpenseActorContext, { actorType: "OWNER" }>;

export async function requireExpenseAccess(businessSlug: string, write = false) {
  const auth = write ? await requireOwnerTenantWriteAccess(businessSlug) : await requireTenantAccess(businessSlug);
  if (!auth.success) return auth;
  const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
  if (!context.success) return context;
  if (write && context.actorType !== "OWNER") return { success: false as const, error: "Forbidden" };
  return { success: true as const, context };
}

export function expenseBusinessWhere(context: ExpenseActorContext): Prisma.BusinessWhereInput {
  return {
    id: context.businessId,
    slug: context.businessSlug,
    ...(context.actorType === "OWNER" ? {
      owners: { some: { id: context.ownerId, user_id: context.userId, business_id: context.businessId, user: { role: Role.OWNER } } },
    } : {
      employees: { some: { id: context.employeeId, user_id: context.userId, business_id: context.businessId, user: { role: Role.EMPLOYEE } } },
    }),
  };
}
