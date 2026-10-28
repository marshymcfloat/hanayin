"use server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { revalidatePath } from "next/cache";
import { PayrollError } from "@/features/payroll/v2/contracts";
import { dateOnly } from "@/features/payroll/v2/schemas";
import { serviceChargeInputSchema } from "@/features/payroll/v2/service-charge-calculation";
import { serviceChargeCommandSchema, serviceChargeRoster, previewServiceCharge, recordServiceCharge } from "@/features/payroll/v2/service-charge";

export async function getServiceChargeRosterAction(input: unknown) {
  const parsed = z.object({ from: dateOnly, to: dateOnly }).refine(value => value.from <= value.to && Date.parse(value.to) - Date.parse(value.from) <= 31 * 86400000).safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Choose a valid collection period." };
  const auth = await requireAuth(); if (!auth.success) return { success: false as const, error: auth.error };
  try { return { success: true as const, data: await serviceChargeRoster({ userId: auth.session.user.id, businessSlug: auth.businessSlug }, parsed.data.from, parsed.data.to) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Service-charge employees are unavailable." }; }
}
export async function previewServiceChargeAction(input: unknown) {
  const parsed = serviceChargeInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? "Verify the collection and eligibility records." };
  const auth = await requireAuth(); if (!auth.success) return { success: false as const, error: auth.error };
  try { return { success: true as const, data: await previewServiceCharge({ userId: auth.session.user.id, businessSlug: auth.businessSlug }, parsed.data) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Service-charge calculation is unavailable." }; }
}
export async function recordServiceChargeAction(input: unknown) {
  const parsed = serviceChargeCommandSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, code: "INVALID_INPUT" as const, error: parsed.error.issues[0]?.message ?? "Verify the collection and eligibility records." };
  const auth = await requireAuth({ write: true }); if (!auth.success) return { success: false as const, code: "FORBIDDEN" as const, error: auth.error };
  const result = await recordServiceCharge({ userId: auth.session.user.id, businessSlug: auth.businessSlug }, parsed.data);
  if (result.success) { revalidatePath("/app/" + auth.businessSlug + "/payroll"); revalidatePath("/app/" + auth.businessSlug + "/my-pay"); }
  return result;
}
