import "server-only";

import {
  sanitizeStaffPermissions,
  type TenantActorContext,
} from "@/lib/auth/staff-access";
import { logAudit } from "@/lib/services/audit";
import type { StaffPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import type { EmployeePermissionsResult } from "@/features/workforce/types/employee-permissions";

type OwnerContext = Extract<
  TenantActorContext,
  { success: true; actorType: "OWNER" }
>;
type Outcome = { result: EmployeePermissionsResult; changed: boolean };

class StaleEmployeePermissions extends Error {}

export async function setEmployeePermissions(input: {
  context: OwnerContext;
  employeeId: number;
  permissions: StaffPermission[];
}): Promise<Outcome> {
  if (input.context.actorType !== "OWNER") {
    return {
      result: { success: false, error: "Forbidden", code: "Forbidden" },
      changed: false,
    };
  }

  try {
    return await prisma.$transaction(async (tx): Promise<Outcome> => {
      const employee = await tx.employee.findFirst({
        where: { id: input.employeeId, business_id: input.context.businessId },
        select: { id: true, profile: true, permissions: true },
      });
      if (!employee) {
        return {
          result: {
            success: false,
            error: "Employee not found.",
            code: "NOT_FOUND",
          },
          changed: false,
        };
      }

      const permissions = sanitizeStaffPermissions(
        employee.profile,
        input.permissions,
      );
      const previous = [...employee.permissions].sort();
      const next = [...permissions].sort();
      const result = {
        success: true as const,
        employeeId: employee.id,
        permissions,
      };
      if (
        previous.length === next.length &&
        previous.every((permission, index) => permission === next[index])
      ) {
        return { result, changed: false };
      }

      const update = await tx.employee.updateMany({
        where: {
          id: employee.id,
          business_id: input.context.businessId,
          profile: employee.profile,
          permissions: { equals: employee.permissions },
        },
        data: { permissions },
      });
      if (update.count !== 1) throw new StaleEmployeePermissions();

      await logAudit(tx, {
        entityType: "Employee",
        entityId: String(employee.id),
        action: "UPDATED",
        actorId: input.context.userId,
        actorType: "USER",
        businessId: input.context.businessId,
        changes: {
          before: { permissions: employee.permissions },
          after: { permissions, mode: "PERMISSIONS_CHANGED" },
        },
      });
      return { result, changed: true };
    });
  } catch (error) {
    const conflict =
      error instanceof StaleEmployeePermissions ||
      (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034");
    return {
      result: {
        success: false,
        error: conflict
          ? "Employee permissions changed. Refresh and try again."
          : "Unable to update employee permissions.",
      },
      changed: false,
    };
  }
}
