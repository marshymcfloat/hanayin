"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedOwnerPermission } from "@/lib/auth/owner-access";
import { ownerIdSchema, ownerPermissionsInputSchema } from "@/features/workforce/owner-administration-schemas";
import { sanitizeOwnerPermissions } from "@/features/workforce/owner-permission-policy";
import { replaceOwnerPermissions, switchPrimaryOwner } from "@/features/workforce/services/owner-administration";
import type { OwnerAdministrationResult } from "@/features/workforce/types/owner-administration";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";

export async function updateOwnerPermissionsAction(ownerId: number, permissions: unknown): Promise<OwnerAdministrationResult> {
  const validation = ownerPermissionsInputSchema.safeParse({ ownerId, permissions });
  if (!validation.success) return { success: false, error: "Invalid input" };
  try {
    const access = await requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE);
    if (!access.success) return access;
    const outcome = await replaceOwnerPermissions(access.context, validation.data.ownerId, sanitizeOwnerPermissions(validation.data.permissions));
    if (outcome.result.success && outcome.changed) revalidatePath(`/app/${access.context.businessSlug}/owners`);
    return outcome.result;
  } catch { return { success: false, error: "Failed to update permissions." }; }
}

export async function setPrimaryOwnerAction(ownerId: number): Promise<OwnerAdministrationResult> {
  const validation = ownerIdSchema.safeParse(ownerId);
  if (!validation.success) return { success: false, error: "Invalid input" };
  try {
    const access = await requireAuthenticatedOwnerPermission(OwnerPermission.SETTINGS_MANAGE);
    if (!access.success) return access;
    const outcome = await switchPrimaryOwner(access.context, validation.data);
    if (outcome.result.success && outcome.changed) revalidatePath(`/app/${access.context.businessSlug}/owners`);
    return outcome.result;
  } catch { return { success: false, error: "Failed to set primary owner." }; }
}
