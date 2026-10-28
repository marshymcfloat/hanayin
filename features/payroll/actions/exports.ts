"use server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { exportPayrollRun, exportStatutoryRegister, exportGovernmentFile } from "@/features/payroll/v2/exports";
import { PayrollError } from "@/features/payroll/v2/contracts";

export async function exportPayrollRunAction(input: unknown) {
  const parsed = z.object({ runId: z.string().uuid(), format: z.enum(["CSV", "XLSX"]) }).safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Invalid export selection." };
  const auth = await requireAuth(); if (!auth.success) return { success: false as const, error: auth.error };
  try { return { success: true as const, file: await exportPayrollRun({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data.runId, parsed.data.format) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Export is unavailable." }; }
}
export async function exportGovernmentPayrollAction(input: unknown) {
  const parsed = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), agency: z.enum(["SSS", "PHILHEALTH", "PAGIBIG", "BIR"]) }).safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Invalid government export selection." };
  const auth = await requireAuth(); if (!auth.success) return { success: false as const, error: auth.error };
  try { return { success: true as const, file: await exportGovernmentFile({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data.month, parsed.data.agency) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Government export is unavailable. Verify setup and the certified layout." }; }
}
export async function exportPayrollStatutoryAction(input: unknown) {
  const parsed = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), agency: z.enum(["SSS", "PHILHEALTH", "PAGIBIG", "BIR"]) }).safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Invalid statutory export selection." };
  const auth = await requireAuth(); if (!auth.success) return { success: false as const, error: auth.error };
  try { return { success: true as const, file: await exportStatutoryRegister({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data.month, parsed.data.agency) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Export is unavailable." }; }
}
