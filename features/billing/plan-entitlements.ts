/** Billing-plan capability resolution for tenant-facing feature gates. */
import { prisma } from "@/prisma/prisma";

export type PlanTier = "STARTER" | "PLUS" | "PRO";

export type PlanEntitlements = {
  website: boolean;
  growth: boolean;
  social: boolean;
  ai: boolean;
  reportsCore: boolean;
  reportsAdvanced: boolean;
};

const PLUS_PLAN_CODE = "PLUS_MONTHLY";
const PRO_PLAN_CODE = "PRO_MONTHLY";
const LEGACY_PRO_ANNUAL_PLAN_CODE = "PRO_ANNUAL";

const STARTER_ENTITLEMENTS: PlanEntitlements = {
  website: false,
  growth: false,
  social: false,
  ai: false,
  reportsCore: true,
  reportsAdvanced: false,
};

const PLUS_ENTITLEMENTS: PlanEntitlements = {
  website: true,
  growth: true,
  social: false,
  ai: false,
  reportsCore: true,
  reportsAdvanced: true,
};

const PRO_ENTITLEMENTS: PlanEntitlements = {
  website: true,
  growth: true,
  social: true,
  ai: true,
  reportsCore: true,
  reportsAdvanced: true,
};

export function resolveTier(planCode?: string | null): PlanTier {
  if (planCode === PRO_PLAN_CODE || planCode === LEGACY_PRO_ANNUAL_PLAN_CODE) return "PRO";
  if (planCode === PLUS_PLAN_CODE) return "PLUS";
  return "STARTER";
}

export function resolveEntitlements(planCode?: string | null): PlanEntitlements {
  const tier = resolveTier(planCode);
  if (tier === "PRO") return PRO_ENTITLEMENTS;
  if (tier === "PLUS") return PLUS_ENTITLEMENTS;
  return STARTER_ENTITLEMENTS;
}

export async function getBusinessPlanCodeBySlug(businessSlug: string) {
  const subscription = await prisma.businessSubscription.findFirst({
    where: {
      business: { slug: businessSlug },
    },
    select: {
      plan: {
        select: {
          code: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
  });

  return subscription?.plan.code ?? null;
}

export async function getBusinessEntitlementsBySlug(businessSlug: string) {
  const planCode = await getBusinessPlanCodeBySlug(businessSlug);
  const tier = resolveTier(planCode);
  const entitlements = resolveEntitlements(planCode);

  return {
    planCode,
    tier,
    ...entitlements,
  };
}
