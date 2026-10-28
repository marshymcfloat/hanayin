import "server-only";

import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import { requireOwnerPermission } from "@/lib/auth/owner-access";
import { OwnerPermission } from "@/prisma/generated/prisma/enums";

export async function requireOwnerInboxAccess(businessSlug: string, requireAi = false) {
  try {
    const access = await requireOwnerPermission(businessSlug, OwnerPermission.SETTINGS_MANAGE);
    if (!access.success) {
      return { success: false as const, reason: "FORBIDDEN" as const, error: "Customer Inbox requires a current owner with settings permission." };
    }
    const entitlements = await getBusinessEntitlementsBySlug(access.context.businessSlug);
    if (!entitlements.social) {
      return { success: false as const, reason: "SOCIAL_REQUIRED" as const, error: "Customer Inbox requires Social access on your current plan." };
    }
    if (requireAi && !entitlements.ai) {
      return { success: false as const, reason: "AI_REQUIRED" as const, error: "Reply suggestions and automation require AI access on your current plan." };
    }
    return { success: true as const, context: access.context, aiEntitled: entitlements.ai };
  } catch {
    return { success: false as const, reason: "UNAVAILABLE" as const, error: "Customer Inbox access could not be checked. Please retry." };
  }
}
