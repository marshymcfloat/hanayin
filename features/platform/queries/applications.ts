import { DEFAULT_SUBSCRIPTION_PLAN_CODE, SUBSCRIPTION_PLAN_CODES, ensureDefaultPlans } from "@/features/billing/subscription-service";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { isPrismaAccelerateResourceLimitError, prisma, supportsOnboardingApplicationModel } from "@/prisma/prisma";

export async function getPlatformApplicationsData() {
  const auth = await requirePlatformAdmin();
  if (!auth.success) return { success: false as const, error: "Forbidden" };
  await ensureDefaultPlans();
  if (!supportsOnboardingApplicationModel()) return { success: false as const, error: "Model unavailable" };
  const applicationsQuery = prisma.onboardingApplication.findMany({ include: { referral_code: { select: { code: true } }, converted_business: { select: { name: true, slug: true } }, reviewed_by_user: { select: { name: true, contact_number: true } } }, orderBy: { created_at: "desc" }, take: 250 });
  type ApplicationRow = Awaited<typeof applicationsQuery>[number];
  const [applicationQueryResult, catalogPlans] = await Promise.all([
    applicationsQuery.then((applications) => ({ applications, limitedByAccelerate: false as const })).catch((error) => {
      if (isPrismaAccelerateResourceLimitError(error)) return { applications: [] as ApplicationRow[], limitedByAccelerate: true as const };
      throw error;
    }),
    prisma.subscriptionPlan.findMany({ where: { code: { in: [...SUBSCRIPTION_PLAN_CODES] }, is_active: true }, select: { code: true, name: true, price_amount: true }, orderBy: [{ price_amount: "asc" }, { code: "asc" }] }),
  ]);
  const defaultAssignablePlanCode = catalogPlans.find((plan) => plan.code === DEFAULT_SUBSCRIPTION_PLAN_CODE)?.code ?? catalogPlans[0]?.code ?? DEFAULT_SUBSCRIPTION_PLAN_CODE;
  return { success: true as const, applications: applicationQueryResult.applications, limitedByAccelerate: applicationQueryResult.limitedByAccelerate, catalogPlans, defaultAssignablePlanCode };
}
