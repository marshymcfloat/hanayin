import "server-only";
import { ownerPermissionMembershipWhere, type OwnerActorContext } from "@/lib/auth/owner-access";
import type { OwnerAdministrationOutcome } from "@/features/workforce/types/owner-administration";
import { logAudit } from "@/lib/services/audit";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

class SpecialtyConflict extends Error {}
const denial = (error: string): OwnerAdministrationOutcome => ({ result: { success: false, error }, changed: false });

export async function replaceOwnerSpecialties(context: OwnerActorContext, ownerId: number, specialties: string[]): Promise<OwnerAdministrationOutcome> {
  if (context.actorType !== "OWNER") return denial("Forbidden");
  try {
    return await prisma.$transaction(async tx => {
      const membership = ownerPermissionMembershipWhere(context, OwnerPermission.SETTINGS_MANAGE);
      const actor = await tx.owner.findFirst({ where: membership, select: { id: true } });
      if (!actor) return denial("Forbidden");
      const target = await tx.owner.findFirst({ where: { id: ownerId, business_id: context.businessId, user: { role: "OWNER" } }, select: { id: true, specialties: true } });
      if (!target) return denial("Owner not found");
      if (target.specialties.length === specialties.length && target.specialties.every((value, index) => value === specialties[index])) return { result: { success: true }, changed: false };
      const update = await tx.owner.updateMany({
        where: { id: target.id, business_id: context.businessId, user: { role: "OWNER" }, specialties: { equals: target.specialties }, business: { owners: { some: membership } } },
        data: { specialties },
      });
      if (update.count !== 1) throw new SpecialtyConflict();
      await logAudit(tx, { entityType: "Owner", entityId: String(target.id), action: "UPDATED", actorId: context.userId, businessId: context.businessId, changes: { before: { specialties: target.specialties }, after: { specialties, mode: "OWNER_SPECIALTIES_UPDATED" } } });
      return { result: { success: true }, changed: true };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  } catch (error) {
    const conflict = error instanceof SpecialtyConflict || (typeof error === "object" && error !== null && "code" in error && error.code === "P2034");
    return denial(conflict ? "Owner settings changed. Refresh and try again." : "Failed to update owner specialties");
  }
}
