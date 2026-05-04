"use server";

/**
 * Lightweight read-only listing of employees in the actor's tenant.
 * Used by booking-action dialogs (e.g. ReassignStaffDialog) that need
 * a small employee picker without threading the list through every
 * panel-opening surface.
 *
 * Permission: any tenant access. The action does NOT gate by
 * QUEUE_OVERRIDE_ALL — the dialog's trigger does that. Treating this
 * as a basic directory read keeps it reusable from any future surface
 * that needs an employee picker.
 */

import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { prisma } from "@/prisma/prisma";

export type EmployeeListEntry = {
  id: number;
  name: string;
  profile: "STAFF" | "MANAGER" | "CASHIER";
};

export type ListBusinessEmployeesResult =
  | { success: true; employees: EmployeeListEntry[] }
  | { success: false; error: string };

export async function listBusinessEmployeesAction(): Promise<ListBusinessEmployeesResult> {
  const auth = await requireAuth();
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const actorContext = await resolveTenantActorContext(
    auth.businessSlug,
    auth.session.user.id,
  );
  if (!actorContext.success) {
    return { success: false, error: actorContext.error };
  }

  const employees = await prisma.employee.findMany({
    where: { business_id: actorContext.businessId },
    select: {
      id: true,
      profile: true,
      user: { select: { name: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return {
    success: true,
    employees: employees.map((e) => ({
      id: e.id,
      name: e.user.name,
      profile: e.profile,
    })),
  };
}
