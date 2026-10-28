"use server";

import { requireAuth } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { getTenantEmployeePicker } from "@/features/workforce/queries/employee-picker";
import type { EmployeePickerEntry, EmployeePickerResult } from "@/features/workforce/types/employee-picker";

export type EmployeeListEntry = EmployeePickerEntry;
export type ListBusinessEmployeesResult = EmployeePickerResult;

export async function listBusinessEmployeesAction(): Promise<ListBusinessEmployeesResult> {
  try {
    const auth = await requireAuth();
    if (!auth.success) return { success: false, error: auth.error };
    const context = await resolveTenantActorContext(auth.businessSlug, auth.session.user.id);
    if (!context.success) return { success: false, error: context.error };
    return { success: true, employees: await getTenantEmployeePicker(context) };
  } catch {
    return { success: false, error: "Unable to load employees." };
  }
}
