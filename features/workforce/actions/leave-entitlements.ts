"use server";
import { requireAuth } from "@/lib/auth/guards";
import { grantLeaveEntitlementSchema, grantLeaveEntitlement, leaveEntitlementReview } from "@/features/workforce/services/leave-entitlements";

export async function grantLeaveEntitlementAction(input: unknown) {
  const parsed = grantLeaveEntitlementSchema.safeParse(input); if (!parsed.success) return { success: false as const, code: "INVALID_INPUT" as const, error: "Verify the benefit, dates, balance, and eligibility evidence." };
  const auth = await requireAuth({ write: true }); if (!auth.success) return { success: false as const, code: "FORBIDDEN" as const, error: auth.error };
  return grantLeaveEntitlement({ businessSlug: auth.businessSlug, userId: auth.session.user.id }, parsed.data);
}
export async function getLeaveEntitlementsAction() {
  const auth = await requireAuth(); if (!auth.success) return auth;
  try { return { success: true as const, data: await leaveEntitlementReview({ businessSlug: auth.businessSlug, userId: auth.session.user.id }) }; }
  catch { return { success: false as const, error: "Leave entitlement records are unavailable." }; }
}
