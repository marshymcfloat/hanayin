"use server";

import { requireAuth, requireTenantAccess } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { requireAuthenticatedOwnerPermission } from "@/lib/auth/owner-access";
import { getTenantOwnerDirectory } from "@/features/businesses/queries/owner-directory";
import { getTenantPendingServiceQueue, getTenantOwnerClaimedServiceQueue } from "@/features/dashboard/queries/service-queues";
import { ownerSpecialtiesSchema } from "@/features/workforce/owner-specialty-schemas";
import { replaceOwnerSpecialties } from "@/features/workforce/services/owner-specialties";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { detectAndEmitFutureBookingConflicts } from "@/lib/services/booking-conflicts";

export async function getPendingServicesAction() {
  try {
    const auth = await requireAuth();
    if (!auth.success) return [];
    const actor = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!actor.success) return [];
    return await getTenantPendingServiceQueue(actor);
  } catch { return []; }
}

export async function getOwnerClaimedServicesAction() {
  try {
    const auth = await requireAuth();
    if (!auth.success) return auth;
    if (auth.session.user.role !== "OWNER") return { success: false, error: "Unauthorized" };
    const actor = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!actor.success || actor.actorType !== "OWNER") return { success: false, error: "Owner not found" };
    return { success: true, data: await getTenantOwnerClaimedServiceQueue(actor) };
  } catch { return { success: false, error: "Unable to fetch claimed services." }; }
}

export async function getOwners(businessSlug: string) {
  const parsed = z.string().min(1).max(200).safeParse(businessSlug);
  if (!parsed.success) return [];
  try {
    const auth = await requireTenantAccess(parsed.data);
    if (!auth.success) return [];
    const actor = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!actor.success || actor.actorType !== "OWNER") return [];
    return await getTenantOwnerDirectory(actor.businessId);
  } catch {
    return [];
  }
}

export async function updateOwnerSpecialties(ownerId: number, specialties: string[]) {
  const parsed = ownerSpecialtiesSchema.safeParse({ ownerId, specialties });
  if (!parsed.success) return { success: false, error: "Invalid input" };
  try {
    const access = await requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE);
    if (!access.success) return access;
    const outcome = await replaceOwnerSpecialties(access.context, parsed.data.ownerId, parsed.data.specialties);
    if (outcome.result.success && outcome.changed) {
      try {
        await detectAndEmitFutureBookingConflicts({ businessSlug: access.context.businessSlug, trigger: "OWNER_SPECIALTIES_UPDATED" });
      } catch { /* Conflict scanning cannot change committed success. */ }
      try { revalidatePath(`/app/${access.context.businessSlug}/owners`); }
      catch { /* Cache invalidation cannot change committed success. */ }
    }
    return outcome.result;
  } catch { return { success: false, error: "Failed to update owner specialties" }; }
}
