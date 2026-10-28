"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { createEmployeeSchema } from "@/features/workforce/employee-create-schema";
import { employeeAdministrationIdSchema, employeePasswordResetInputSchema, employeeScheduleInputSchema, employeeUpdateInputSchema } from "@/features/workforce/employee-administration-schemas";
import { getEmployeeAdministrationList, getEmployeeAdministrationSchedule } from "@/features/workforce/queries/employee-administration";
import { createEmployeeAdministration, deleteEmployeeAdministration, replaceEmployeeAdministrationSchedule, resendEmployeeAdministrationInvite, resetEmployeeAdministrationPassword, updateEmployeeAdministration } from "@/features/workforce/services/employee-administration";
import type { EmployeeAdministrationIdentity, EmployeeCreateInput, EmployeeScheduleRow, EmployeeUpdateInput } from "@/features/workforce/employee-administration-types";
export type { EmployeeScheduleRow } from "@/features/workforce/employee-administration-types";

async function execute<T>(write: boolean, fallback: string, work: (identity: EmployeeAdministrationIdentity) => Promise<T>) {
  try {
    const auth = write ? await requireAuth({ write: true }) : await requireAuth();
    if (!auth.success) return auth;
    if (write && auth.session.user.role !== "OWNER") return { success: false as const, error: "Forbidden" };
    return await work({ businessSlug: auth.businessSlug, userId: auth.session.user.id });
  } catch { return { success: false as const, error: fallback }; }
}
function refresh(businessSlug: string) { try { revalidatePath(`/app/${businessSlug}/employees`); } catch {} }

export async function getEmployeesAction() {
  return execute(false, "Failed to fetch employees", getEmployeeAdministrationList);
}
export async function createEmployeeAction(data: EmployeeCreateInput) {
  const parsed = createEmployeeSchema.safeParse(data);
  if (!parsed.success) return { success: false as const, error: "Invalid employee input" };
  return execute(true, "Failed to create employee", async identity => {
    const result = await createEmployeeAdministration(identity, parsed.data);
    if (result.success) refresh(identity.businessSlug);
    return result;
  });
}
export async function updateEmployeeAction(employeeId: number, data: EmployeeUpdateInput) {
  const parsed = employeeUpdateInputSchema.safeParse({ employeeId, data });
  if (!parsed.success) return { success: false as const, error: "Invalid employee input" };
  return execute(true, "Failed to update employee", async identity => {
    const result = await updateEmployeeAdministration(identity, parsed.data.employeeId, parsed.data.data);
    if (result.success) { refresh(identity.businessSlug); if (parsed.data.data.employment_start !== undefined) revalidatePath(`/app/${identity.businessSlug}/payroll`); }
    return result;
  });
}
export async function deleteEmployeeAction(employeeId: number) {
  const parsed = employeeAdministrationIdSchema.safeParse(employeeId);
  if (!parsed.success) return { success: false as const, error: "Invalid employee input" };
  return execute(true, "Failed to delete employee", async identity => {
    const result = await deleteEmployeeAdministration(identity, parsed.data);
    if (result.success) refresh(identity.businessSlug);
    return result;
  });
}
export async function resetEmployeePasswordAction(employeeId: number, newPassword: string) {
  const parsed = employeePasswordResetInputSchema.safeParse({ employeeId, newPassword });
  if (!parsed.success) return { success: false as const, error: "Invalid employee input" };
  return execute(true, "Failed to reset password", identity => resetEmployeeAdministrationPassword(identity, parsed.data.employeeId, parsed.data.newPassword));
}
export async function resendEmployeeInviteAction(employeeId: number) {
  const parsed = employeeAdministrationIdSchema.safeParse(employeeId);
  if (!parsed.success) return { success: false as const, error: "Invalid employee input" };
  return execute(true, "Failed to resend invite.", async identity => {
    const result = await resendEmployeeAdministrationInvite(identity, parsed.data);
    if (result.success) refresh(identity.businessSlug);
    return result;
  });
}
export async function getEmployeeScheduleAction(employeeId: number) {
  const parsed = employeeAdministrationIdSchema.safeParse(employeeId);
  if (!parsed.success) return { success: false as const, error: "Invalid employee input" };
  return execute(false, "Failed to fetch schedule.", identity => getEmployeeAdministrationSchedule(identity, parsed.data));
}
export async function upsertEmployeeScheduleAction(employeeId: number, rows: EmployeeScheduleRow[]) {
  const parsed = employeeScheduleInputSchema.safeParse({ employeeId, rows });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return { success: false as const, error: message && ["Invalid day of week.", "Times must be in HH:MM 24h format.", "Start and end can't be the same time.", "Time ranges overlap on the same day."].includes(message) ? message : "Invalid schedule input" };
  }
  return execute(true, "Failed to save schedule.", async identity => {
    const result = await replaceEmployeeAdministrationSchedule(identity, parsed.data.employeeId, parsed.data.rows);
    if (result.success) refresh(identity.businessSlug);
    return result;
  });
}
