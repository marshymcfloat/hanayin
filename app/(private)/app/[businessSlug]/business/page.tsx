import { getBusinessSettingsData } from "@/features/businesses/queries/settings";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { BusinessSettingsForm } from "./BusinessSettingsForm";
import { BrandLibrarySection } from "@/components/business/BrandLibrarySection";

export default async function BusinessSettingsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const data = await getBusinessSettingsData(businessSlug);
  if (!data) {
    return <div>Business not found</div>;
  }

  // Brand library lives next to other identity fields (logo,
  // hero, AI reference photos). Listed only for owner-managed kinds
  // so the page stays focused; service/employee thumbnails live on
  // their own admin pages.
  const { business, brandAssets, socialEntitled, socialPublishingEnabled } = data;

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

        <section className="mt-6 rounded-3xl border border-zinc-200/60 bg-white shadow-sm overflow-hidden">
          <header className="bg-white border-b border-zinc-100 p-6">
            <h2 className="text-xl font-bold text-foreground">Brand Library</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Reusable images for your social posts, AI image generation,
              and public booking page.
            </p>
          </header>
          <div className="p-6 space-y-1">
            <BrandLibrarySection assets={brandAssets} />
          </div>
        </section>
      </section>
    </div>
  );
}
