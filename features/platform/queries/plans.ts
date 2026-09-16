import { SUBSCRIPTION_PLAN_CODES, ensureDefaultPlans } from "@/features/billing/subscription-service";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";

export async function getPlatformPlansData() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return null;
  await ensureDefaultPlans();
  const [plans, legacyOrInactiveAssignments] = await Promise.all([
    prisma.subscriptionPlan.findMany({ orderBy: [{ is_active: "desc" }, { code: "asc" }] }),
    prisma.businessSubscription.count({ where: { OR: [{ plan: { code: { notIn: [...SUBSCRIPTION_PLAN_CODES] } } }, { plan: { is_active: false } }] } }),
  ]);
  return { plans, legacyOrInactiveAssignments, activePlans: plans.filter((plan) => plan.is_active).length, monthlyPlans: plans.filter((plan) => plan.billing_interval === "MONTHLY").length, inactivePlans: plans.filter((plan) => !plan.is_active).length };
}
