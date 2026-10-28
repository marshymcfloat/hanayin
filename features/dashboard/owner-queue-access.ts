import "server-only";
import type { TenantActorContext } from "@/lib/auth/staff-access";
import type { Prisma } from "@/prisma/generated/prisma/client";

export type OwnerQueueContext = Extract<TenantActorContext, { success: true; actorType: "OWNER" }>;

export function ownerQueueMembership(context: OwnerQueueContext): Prisma.OwnerWhereInput {
  return { id: context.ownerId, user_id: context.userId, business_id: context.businessId, business: { slug: context.businessSlug }, user: { role: "OWNER" } };
}

export function ownerQueueBookingScope(context: OwnerQueueContext): Prisma.BookingWhereInput {
  return { business_id: context.businessId, business: { owners: { some: ownerQueueMembership(context) } }, OR: [{ customer_id: null }, { customer: { business_id: context.businessId } }] };
}

export function ownerQueueServiceScope(context: OwnerQueueContext): Prisma.AvailedServiceWhereInput {
  return { booking: ownerQueueBookingScope(context), service: { business_id: context.businessId }, OR: [{ package_id: null }, { package: { business_id: context.businessId } }] };
}
