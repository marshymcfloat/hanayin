"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/features/auth/auth-options";
import { readOwnerBookingCatalog } from "@/features/bookings/queries/owner-booking-catalog";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { businessSlugSchema } from "@/lib/validation/business-slug";

export async function getOwnerBookingCatalog(businessSlug: string) {
  const parsed = businessSlugSchema.safeParse(businessSlug);
  if (!parsed.success) return { success: false as const, denied: true as const };

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "OWNER" || session.user.businessSlug !== parsed.data) {
      return { success: false as const, denied: true as const };
    }

    const actor = await resolveTenantActorContext(parsed.data, session.user.id);
    if (!actor.success || actor.actorType !== "OWNER") return { success: false as const, denied: true as const };

    return { success: true as const, data: await readOwnerBookingCatalog(actor.businessId) };
  } catch {
    return { success: false as const, denied: false as const };
  }
}
