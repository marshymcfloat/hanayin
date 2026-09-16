import { getGrowthPlannerData } from "@/features/growth/queries/planner";
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

  const data = await getGrowthPlannerData(businessSlug, rawSearchParams);
  if (!data.success && data.error === "Forbidden") {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  if (!data.success && data.error === "Upgrade required") {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Growth Planner</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Growth features are available on Plus and Pro plans.
        </p>
      </div>
    );
  }

  if (!data.success) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Business not found</h1>
      </div>
    );
  }

  return (
    <GrowthPlannerPageClient
      businessSlug={businessSlug}
      businessName={data.businessName}
      events={data.events}
      year={data.year}
      month={data.month}
    />
  );
}
