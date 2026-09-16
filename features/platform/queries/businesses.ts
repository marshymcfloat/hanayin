import { DEFAULT_SUBSCRIPTION_PLAN_CODE, SUBSCRIPTION_PLAN_CODES, ensureDefaultPlans } from "@/features/billing/subscription-service";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";

export async function getPlatformBusinessesData() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return null;
  await ensureDefaultPlans();
  const [businesses, catalogPlans, upgradeRequests] = await Promise.all([
    prisma.business.findMany({ include: { subscriptions: { include: { plan: true } }, owners: { include: { user: { select: { contact_number: true, name: true } } }, take: 1 } }, orderBy: { created_at: "desc" }, take: 200 }),
    prisma.subscriptionPlan.findMany({ where: { code: { in: [...SUBSCRIPTION_PLAN_CODES] } }, select: { code: true, name: true, price_amount: true, is_active: true }, orderBy: [{ price_amount: "asc" }, { code: "asc" }] }),
    prisma.subscriptionPlanUpgradeRequest.findMany({ include: { business: { select: { id: true, name: true, slug: true } }, current_plan: { select: { code: true } }, target_plan: { select: { code: true, name: true } }, requested_by_user: { select: { name: true, contact_number: true } }, reviewed_by_user: { select: { name: true, contact_number: true } } }, orderBy: { created_at: "desc" }, take: 200 }),
  ]);
  const assignablePlans = catalogPlans.filter((plan) => plan.is_active);
  const defaultAssignablePlanCode = assignablePlans.find((plan) => plan.code === DEFAULT_SUBSCRIPTION_PLAN_CODE)?.code ?? assignablePlans[0]?.code ?? DEFAULT_SUBSCRIPTION_PLAN_CODE;
  return { businesses, catalogPlans, upgradeRequests, assignablePlans, defaultAssignablePlanCode };
}
