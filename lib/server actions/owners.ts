"use server";

import { prisma } from "@/prisma/prisma";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/auth/guards";
import { Role } from "@/prisma/generated/prisma/enums";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";

// All valid permissions in a single Set so we can validate incoming
// arrays without trusting client-side enums.
const VALID_OWNER_PERMISSIONS = new Set<string>(
  Object.values(OwnerPermission),
);

function sanitizeOwnerPermissions(input: unknown): OwnerPermission[] {
  if (!Array.isArray(input)) return [];
  const cleaned = new Set<OwnerPermission>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    if (VALID_OWNER_PERMISSIONS.has(raw)) {
      cleaned.add(raw as OwnerPermission);
    }
  }
  // REPORTS_VIEW_FULL implies REPORTS_VIEW_SALES_ONLY -- granting the
  // less-privileged view alongside is redundant noise. Drop the
  // narrower one if both are present so chip state stays clean.
  if (
    cleaned.has(OwnerPermission.REPORTS_VIEW_FULL) &&
    cleaned.has(OwnerPermission.REPORTS_VIEW_SALES_ONLY)
  ) {
    cleaned.delete(OwnerPermission.REPORTS_VIEW_SALES_ONLY);
  }
  return Array.from(cleaned);
}

// Owner mutations are owner-only. Co-owners with restricted perms can
// still see the owners page (read-only) but mutating other owners'
// permissions requires the SETTINGS_MANAGE capability, which is part
// of the default full-power set.
async function requireOwnerSettingsAccess() {
  const auth = await requireAuth({ write: true });
  if (!auth.success) return auth;
  if (auth.session.user.role !== Role.OWNER) {
    return { success: false as const, error: "Forbidden" };
  }

  // Verify the caller has SETTINGS_MANAGE on their own Owner row.
  const callerOwner = await prisma.owner.findFirst({
    where: {
      user_id: auth.session.user.id,
      business: { slug: auth.businessSlug },
    },
    select: { permissions: true },
  });
  if (
    !callerOwner ||
    !callerOwner.permissions.includes(OwnerPermission.SETTINGS_MANAGE)
  ) {
    return { success: false as const, error: "Missing SETTINGS_MANAGE permission" };
  }

  return auth;
}

export async function updateOwnerPermissionsAction(
  ownerId: number,
  permissions: string[],
) {
  const auth = await requireOwnerSettingsAccess();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  const validated = sanitizeOwnerPermissions(permissions);
  if (validated.length === 0) {
    return {
      success: false as const,
      error: "An owner must have at least one permission.",
    };
  }

  try {
    // Verify the target owner is in caller's business -- raw ID
    // wouldn't otherwise scope cross-tenant.
    const target = await prisma.owner.findFirst({
      where: {
        id: ownerId,
        business: { slug: businessSlug },
      },
      select: { id: true, is_primary: true },
    });
    if (!target) {
      return { success: false as const, error: "Owner not found" };
    }

    // Primary owner can't lose SETTINGS_MANAGE -- otherwise nobody can
    // edit owner permissions anymore.
    if (
      target.is_primary &&
      !validated.includes(OwnerPermission.SETTINGS_MANAGE)
    ) {
      return {
        success: false as const,
        error: "The primary owner must keep SETTINGS_MANAGE.",
      };
    }

    await prisma.owner.update({
      where: { id: ownerId },
      data: { permissions: validated },
    });

    revalidatePath(`/app/${businessSlug}/owners`);
    return { success: true as const };
  } catch (error) {
    logger.error("Failed to update owner permissions:", { error });
    return {
      success: false as const,
      error: "Failed to update permissions.",
    };
  }
}

export async function setPrimaryOwnerAction(ownerId: number) {
  const auth = await requireOwnerSettingsAccess();
  if (!auth.success) return auth;
  const { businessSlug } = auth;

  try {
    const target = await prisma.owner.findFirst({
      where: { id: ownerId, business: { slug: businessSlug } },
      select: { id: true, business_id: true, is_primary: true },
    });
    if (!target) {
      return { success: false as const, error: "Owner not found" };
    }
    if (target.is_primary) {
      return { success: true as const };
    }

    // Atomically: clear primary on all owners of this business, set
    // primary on the target. Using a transaction so a partial update
    // can never leave the business with zero or two primaries.
    await prisma.$transaction(async (tx) => {
      await tx.owner.updateMany({
        where: { business_id: target.business_id },
        data: { is_primary: false },
      });
      await tx.owner.update({
        where: { id: target.id },
        data: { is_primary: true },
      });
    });

    revalidatePath(`/app/${businessSlug}/owners`);
    return { success: true as const };
  } catch (error) {
    logger.error("Failed to set primary owner:", { error });
    return {
      success: false as const,
      error: "Failed to set primary owner.",
    };
  }
}
