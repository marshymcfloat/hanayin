"use server";
import { requireAuth } from "@/lib/auth/guards";
import { revalidatePath } from "next/cache";
import { PayrollError } from "@/features/payroll/v2/contracts";
import { maternityInputSchema } from "@/features/payroll/v2/leave-awards-calculation";
import { maternityAwardCommandSchema, maternityEntitlements, previewMaternityAward, recordMaternityAward } from "@/features/payroll/v2/leave-awards";

export async function getMaternityAwardEntitlementsAction() {
  const auth = await requireAuth(); if (!auth.success) return { success: false as const, error: auth.error };
  try { return { success: true as const, data: await maternityEntitlements({ userId: auth.session.user.id, businessSlug: auth.businessSlug }) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Maternity entitlements are unavailable." }; }
}
export async function previewMaternityAwardAction(input: unknown) {
  const parsed = maternityInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message ?? "Verify maternity evidence." };
  const auth = await requireAuth(); if (!auth.success) return { success: false as const, error: auth.error };
  try { return { success: true as const, data: await previewMaternityAward({ userId: auth.session.user.id, businessSlug: auth.businessSlug }, parsed.data) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Maternity calculation is unavailable." }; }
}
export async function recordMaternityAwardAction(input: unknown) {
  const parsed = maternityAwardCommandSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, code: "INVALID_INPUT" as const, error: parsed.error.issues[0]?.message ?? "Verify maternity evidence." };
  const auth = await requireAuth({ write: true }); if (!auth.success) return { success: false as const, code: "FORBIDDEN" as const, error: auth.error };
  const result = await recordMaternityAward({ userId: auth.session.user.id, businessSlug: auth.businessSlug }, parsed.data);
  if (result.success) { revalidatePath("/app/" + auth.businessSlug + "/payroll"); revalidatePath("/app/" + auth.businessSlug + "/attendance"); }
  return result;
}
