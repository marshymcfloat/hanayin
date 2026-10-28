import "server-only";
import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext, type TenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { Role } from "@/prisma/generated/prisma/enums";
export type CustomerActorContext = Extract<TenantActorContext, { success: true }>;
export async function requireCustomerAccess(write = false) {
  const auth = await requireAuth(write ? { write: true } : undefined);
  if (!auth.success) return auth;
  if (!auth.session?.user?.id) return { success: false as const, error: "Unauthorized" };
  const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
  return context.success ? { success: true as const, context } : context;
}
export function customerBusinessWhere(context: CustomerActorContext): Prisma.BusinessWhereInput {
  if (context.actorType === "OWNER" && context.role === Role.OWNER) return {
    id: context.businessId, slug: context.businessSlug,
    owners: { some: { id: context.ownerId, user_id: context.userId, business_id: context.businessId, user: { role: Role.OWNER } } },
  };
  if (context.actorType === "EMPLOYEE" && context.role === Role.EMPLOYEE) return {
    id: context.businessId, slug: context.businessSlug,
    employees: { some: { id: context.employeeId, user_id: context.userId, business_id: context.businessId, user: { role: Role.EMPLOYEE } } },
  };
  return { id: { in: [] } };
}
