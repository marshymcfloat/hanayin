import "server-only";
import { ownerPermissionMembershipWhere, type OwnerActorContext } from "@/lib/auth/owner-access";
import { logAudit } from "@/lib/services/audit";
import type { OwnerAdministrationOutcome } from "@/features/workforce/types/owner-administration";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { OwnerPermission, Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

class OwnerSettingsConflict extends Error {}
class OwnerSettingsAccessDenied extends Error {}
const success = (changed: boolean): OwnerAdministrationOutcome => ({ result: { success: true }, changed });
const denial = (error: string): OwnerAdministrationOutcome => ({ result: { success: false, error }, changed: false });

async function assertCurrentSettingsAccess(tx: Prisma.TransactionClient, context: OwnerActorContext) {
  const actor = await tx.owner.findFirst({
    where: ownerPermissionMembershipWhere(context, OwnerPermission.SETTINGS_MANAGE),
    select: { id: true },
  });
  if (!actor) throw new OwnerSettingsAccessDenied();
}

function failure(error: unknown, fallback: string) {
  if (error instanceof OwnerSettingsAccessDenied) return denial("Forbidden");
  const conflict = error instanceof OwnerSettingsConflict ||
    (typeof error === "object" && error !== null && "code" in error && error.code === "P2034");
  return denial(conflict ? "Owner settings changed. Refresh and try again." : fallback);
}

export async function replaceOwnerPermissions(context: OwnerActorContext, ownerId: number, permissions: OwnerPermission[]): Promise<OwnerAdministrationOutcome> {
  if (context.actorType !== "OWNER") return denial("Forbidden");
  if (permissions.length === 0) return denial("An owner must have at least one permission.");
  try {
    return await prisma.$transaction(async tx => {
      await assertCurrentSettingsAccess(tx, context);
      const target = await tx.owner.findFirst({
        where: { id: ownerId, business_id: context.businessId, user: { role: Role.OWNER } },
        select: { id: true, is_primary: true, permissions: true },
      });
      if (!target) return denial("Owner not found");
      if (target.is_primary && !permissions.includes(OwnerPermission.SETTINGS_MANAGE)) return denial("The primary owner must keep SETTINGS_MANAGE.");

      const previous = [...target.permissions].sort();
      const next = [...permissions].sort();
      if (previous.length === next.length && previous.every((permission, index) => permission === next[index])) return success(false);

      const update = await tx.owner.updateMany({
        where: {
          id: target.id, business_id: context.businessId, user: { role: Role.OWNER },
          is_primary: target.is_primary, permissions: { equals: target.permissions },
        },
        data: { permissions },
      });
      if (update.count !== 1) throw new OwnerSettingsConflict();
      await logAudit(tx, {
        entityType: "Owner", entityId: String(target.id), action: "UPDATED",
        actorId: context.userId, businessId: context.businessId,
        changes: { before: { permissions: target.permissions }, after: { permissions, mode: "OWNER_PERMISSIONS_CHANGED" } },
      });
      return success(true);
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  } catch (error) { return failure(error, "Failed to update permissions."); }
}

export async function switchPrimaryOwner(context: OwnerActorContext, ownerId: number): Promise<OwnerAdministrationOutcome> {
  if (context.actorType !== "OWNER") return denial("Forbidden");
  try {
    return await prisma.$transaction(async tx => {
      await assertCurrentSettingsAccess(tx, context);
      const target = await tx.owner.findFirst({
        where: { id: ownerId, business_id: context.businessId, user: { role: Role.OWNER } },
        select: { id: true, is_primary: true, permissions: true },
      });
      if (!target) return denial("Owner not found");
      if (!target.permissions.includes(OwnerPermission.SETTINGS_MANAGE)) return denial("The primary owner must have SETTINGS_MANAGE.");
      if (target.is_primary) return success(false);

      const previous = await tx.owner.findMany({
        where: { business_id: context.businessId, is_primary: true }, select: { id: true }, orderBy: { id: "asc" },
      });
      const clear = await tx.owner.updateMany({
        where: { business_id: context.businessId, is_primary: true }, data: { is_primary: false },
      });
      if (clear.count !== previous.length) throw new OwnerSettingsConflict();
      const promote = await tx.owner.updateMany({
        where: {
          id: target.id, business_id: context.businessId, user: { role: Role.OWNER },
          is_primary: false, permissions: { equals: target.permissions },
        },
        data: { is_primary: true },
      });
      if (promote.count !== 1) throw new OwnerSettingsConflict();
      await logAudit(tx, {
        entityType: "Business", entityId: context.businessId, action: "UPDATED",
        actorId: context.userId, businessId: context.businessId,
        changes: { before: { primaryOwnerIds: previous.map(owner => owner.id) }, after: { primaryOwnerId: target.id, mode: "PRIMARY_OWNER_CHANGED" } },
      });
      return success(true);
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  } catch (error) { return failure(error, "Failed to set primary owner."); }
}
