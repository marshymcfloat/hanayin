import { prisma } from "@/prisma/prisma";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { BusinessSettingsForm } from "./BusinessSettingsForm";
import { isSocialPublishingEnabledForBusiness } from "@/lib/features/social-publishing";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";

export default async function BusinessSettingsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  const socialEntitled = entitlements.social;
  const socialPublishingEnabled =
    socialEntitled && isSocialPublishingEnabledForBusiness(businessSlug);

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    include: {
      growth_settings: true,
      social_connections: {
        orderBy: { platform: "asc" },
      },
    },
  });

  if (!business) {
    return <div>Business not found</div>;
  }

  return (
    <div className="flex flex-col p-4 md:p-8 bg-background min-h-screen">
      <section className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        <PageHeader
          title="Business Settings"
          description="Manage your business profile and preferences."
          className="mb-8"
        />
        <BusinessSettingsForm
          business={business}
          socialEntitled={socialEntitled}
          socialPublishingEnabled={socialPublishingEnabled}
        />
      </section>
    </div>
  );
}
