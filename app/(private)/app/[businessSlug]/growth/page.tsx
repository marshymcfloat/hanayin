import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";
import { getMonthlyPlannerEvents } from "@/lib/services/growth/monthly-planner";
import { prisma } from "@/prisma/prisma";
import { GrowthPlannerPageClient } from "@/components/dashboard/owner/growth/GrowthPlannerPageClient";

export default async function GrowthPlannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessSlug } = await params;
  const rawSearchParams = await searchParams;

  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.growth) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Growth Planner</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Growth features are available on Plus and Pro plans.
        </p>
      </div>
    );
  }

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true, name: true, slug: true, created_at: true },
  });

  if (!business) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Business not found</h1>
      </div>
    );
  }

  const now = new Date();
  const yearParam = typeof rawSearchParams.year === "string" ? Number.parseInt(rawSearchParams.year, 10) : NaN;
  const monthParam = typeof rawSearchParams.month === "string" ? Number.parseInt(rawSearchParams.month, 10) : NaN;

  const year = Number.isFinite(yearParam) && yearParam >= 2020 && yearParam <= 2030 ? yearParam : now.getFullYear();
  const month = Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : now.getMonth() + 1;

  const events = await getMonthlyPlannerEvents({
    businessId: business.id,
    businessSlug: business.slug,
    businessCreatedAt: business.created_at,
    year,
    month,
  });

  return (
    <GrowthPlannerPageClient
      businessSlug={businessSlug}
      businessName={business.name}
      events={events.map((e) => ({
        ...e,
        date: e.date.toISOString(),
      }))}
      year={year}
      month={month}
    />
  );
}
