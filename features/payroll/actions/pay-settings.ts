"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { employeePaySettings } from "@/features/payroll/queries/employee-pay-settings";
import { PayrollError } from "@/features/payroll/v2/contracts";

export async function getEmployeePaySettingsAction(input: unknown) {
  const parsed = z.number().int().positive().safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Choose a valid employee." };
  const auth = await requireAuth();
  if (!auth.success) return { success: false as const, error: auth.error };
  try { return { success: true as const, data: await employeePaySettings({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Pay settings could not be loaded.", forbidden: error instanceof PayrollError && error.code === "FORBIDDEN" }; }
}
