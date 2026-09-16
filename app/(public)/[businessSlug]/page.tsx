import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Script from "next/script";
import { connection } from "next/server";
import { unstable_cache } from "next/cache";
import BeautyFeelLanding from "@/components/facing/beautyfeel/BeautyFeelLanding";
import {
  beautyFeelContent,
  isBeautyFeelSlug,
} from "@/components/facing/beautyfeel/content";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Suspense } from "react";
import BusinessFacingSkeleton from "@/components/skeletons/BusinessFacingSkeleton";
import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import {
  buildLocalBusinessJsonLd,
  getPublicBusinessMetadata,
  getPublicBusinessProfile,
} from "@/features/businesses/public-directory";

interface Props {
  params: Promise<{
    businessSlug: string;
  }>;
}
const getBusinessMetadata = unstable_cache(
  async (slug: string) => {
    return getPublicBusinessMetadata(slug);
  },
  ["business-metadata"],
  { revalidate: 60 },
);

import { constructMetadata } from "@/lib/metadata";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { businessSlug } = await params;
  const business = await getBusinessMetadata(businessSlug);

  if (!business) {
    return constructMetadata({
      title: "Business Not Found",
      noIndex: true,
    });
  }

  const imageUrl = business.imageUrl || "/og-image.png";

  return constructMetadata({
    title: `${business.name} | Book Online`,
    description:
      business.description ||
      `Book appointments online at ${business.name}. Browse services and business hours, check real-time availability, and reserve your preferred slot in seconds.`,
    image: imageUrl,
    canonical: `/${business.slug}`,
    keywords: [
      `${business.name} booking`,
      `${business.name} appointments`,
      `book ${business.name} online`,
      `${business.name} services`,
      "online appointment booking",
    ],
  });
}

export default function FacingWebsitePage({ params }: Props) {
  return (
    <Suspense fallback={<BusinessFacingSkeleton />}>
      <FacingWebsiteContent params={params} />
    </Suspense>
  );
}
async function FacingWebsiteContent({ params }: Props) {
  await connection();
  const { businessSlug } = await params;

  const profile = await getPublicBusinessProfile(businessSlug);
  if (!profile) {
    notFound();
  }
  const { business, services, saleEvents } = profile;

  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.website) {
    redirect(`/${businessSlug}/booking`);
  }

  const isBeautyFeel = isBeautyFeelSlug(business.slug);
  const jsonLd = buildLocalBusinessJsonLd(
    business,
    isBeautyFeel
      ? beautyFeelContent.socials.map((social) => social.href)
      : undefined,
  );

  if (isBeautyFeel) {
    return (
      <>
        <Script
          id="json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <BeautyFeelLanding
          business={business}
          services={services}
          businessHours={business.business_hours}
          saleEvents={saleEvents}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <h1 className="text-4xl font-semibold">{business.name}</h1>
        <p className="text-muted-foreground">
          This business is still preparing their public-facing website. You can
          book an appointment online now.
        </p>
        <Button asChild>
          <Link href={`/${business.slug}/booking`}>Book now</Link>
        </Button>
      </div>
    </div>
  );
}
