"use server";

/**
 * Owner-only action that updates a single employee's StaffPermission
 * array. Used by the EditPermissionsDialog on the employees page.
 *
 * Permission model:
 *   - Owner only. Modifying who can do what is intentionally not
 *     delegable — managers can't grant their own peers extra rights.
 *   - Validates the incoming permissions through sanitizeStaffPermissions
 *     so unknown values are filtered out and an empty array falls back
 *     to the profile defaults rather than wiping the row.
 *   - Verifies the employee belongs to the actor's business; cross-tenant
 *     writes are impossible by construction.
 *
 * Audit: writes a single AuditLog row tagged "PERMISSIONS_CHANGED" with
 * the before/after permission lists so the change is reviewable later.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import {
  resolveTenantActorContext,
  sanitizeStaffPermissions,
} from "@/lib/auth/staff-access";
import { logAudit } from "@/lib/services/audit";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";

const setEmployeePermissionsSchema = z.object({
  businessSlug: z.string().min(1),
  employeeId: z.coerce.number().int().positive(),
  permissions: z.array(z.nativeEnum(StaffPermission)),
});

export type SetEmployeePermissionsResult =
  | {
      success: true;
      employeeId: number;
      permissions: StaffPermission[];
    }
  | {
      success: false;
      error: string;
      code?: "Forbidden" | "Unauthorized" | "InvalidInput" | "NOT_FOUND";
    };

export async function setEmployeePermissionsAction(
  input: z.input<typeof setEmployeePermissionsSchema>,
): Promise<SetEmployeePermissionsResult> {
  const validation = setEmployeePermissionsSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: "Invalid input", code: "InvalidInput" };
  }

  const auth = await requireOwnerTenantWriteAccess(validation.data.businessSlug);
  if (!auth.success) {
    return {
      success: false,
      error: auth.error,
      code:
        auth.error === "Unauthorized"
          ? "Unauthorized"
          : auth.error === "Forbidden"
            ? "Forbidden"
            : undefined,
    };
  }

  const actorContext = await resolveTenantActorContext(
    validation.data.businessSlug,
    auth.session.user.id,
  );
  if (!actorContext.success) {
    return { success: false, error: actorContext.error, code: "Forbidden" };
  }

  const employee = await prisma.employee.findFirst({
    where: {
      id: validation.data.employeeId,
      business_id: actorContext.businessId,
    },
    select: {
      id: true,
      profile: true,
      permissions: true,
      user: { select: { name: true } },
    },
  });
  if (!employee) {
    return {
      success: false,
      error: "Employee not found.",
      code: "NOT_FOUND",
    };
  }

  // Filter via the same sanitizer the actor-context resolver uses so
  // an empty input falls back to profile defaults rather than wiping.
  const sanitized = sanitizeStaffPermissions(
    employee.profile,
    validation.data.permissions,
  );

  // Idempotent: if the resulting list matches what's stored, skip the
  // update and the audit row.
  const previous = [...employee.permissions].sort();
  const next = [...sanitized].sort();
  const unchanged =
    previous.length === next.length &&
    previous.every((p, i) => p === next[i]);

  if (unchanged) {
    return {
      success: true,
      employeeId: employee.id,
      permissions: sanitized,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employee.id },
      data: { permissions: sanitized },
    });

    await logAudit(tx, {
      entityType: "Employee",
      entityId: String(employee.id),
      action: "UPDATED",
      actorId: actorContext.userId,
      actorType: "USER",
      businessId: actorContext.businessId,
      changes: {
        before: { permissions: employee.permissions },
        after: {
          permissions: sanitized,
          mode: "PERMISSIONS_CHANGED",
        },
      },
    });
  });

  revalidatePath(`/app/${validation.data.businessSlug}/employees`);

  return {
    success: true,
    employeeId: employee.id,
    permissions: sanitized,
  };
}
