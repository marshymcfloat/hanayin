"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { setEmployeePermissions } from "@/features/workforce/services/employee-permissions";
import type { EmployeePermissionsResult } from "@/features/workforce/types/employee-permissions";
import { StaffPermission } from "@/prisma/generated/prisma/enums";

const setEmployeePermissionsSchema = z.object({
  businessSlug: z.string().min(1),
  employeeId: z.coerce.number().int().positive(),
  permissions: z.array(z.nativeEnum(StaffPermission)),
});

export type SetEmployeePermissionsResult = EmployeePermissionsResult;

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

  if (actorContext.actorType !== "OWNER") {
    return { success: false, error: "Forbidden", code: "Forbidden" };
  }

  const outcome = await setEmployeePermissions({
    context: actorContext,
    employeeId: validation.data.employeeId,
    permissions: validation.data.permissions,
  });
  if (outcome.result.success && outcome.changed) {
    revalidatePath(`/app/${actorContext.businessSlug}/employees`);
  }
  return outcome.result;
}
