"use server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { leaveDecisionSchema, decideReviewedLeave, leaveReview } from "@/features/workforce/services/leave-review";
import { PayrollError } from "@/features/payroll/public";
export async function getLeaveReviewAction(page = 1) {
  const auth = await requireAuth(); if (!auth.success) return auth;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return { success: false as const, error: "Invalid leave page." };
  try { return { success: true as const, data: await leaveReview({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, page) }; }
  catch (error) { return { success: false as const, error: error instanceof PayrollError ? error.message : "Leave review is unavailable." }; }
}
export async function decideReviewedLeaveAction(input: unknown) {
  const parsed = leaveDecisionSchema.safeParse(input); if (!parsed.success) return { success: false as const, code: "INVALID_INPUT" as const, error: "Verify the decision, paid treatment, and reason." };
  const auth = await requireAuth({ write: true }); if (!auth.success) return { success: false as const, code: "FORBIDDEN" as const, error: auth.error };
  const result = await decideReviewedLeave({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data);
  if (result.success) for (const route of ["attendance", "leave-requests", "payroll", "my-pay"]) revalidatePath("/app/" + auth.businessSlug + "/" + route);
  return result;
}
