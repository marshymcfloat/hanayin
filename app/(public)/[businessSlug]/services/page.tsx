import { prisma } from "@/prisma/prisma";
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import BeautyFeelServices from "@/components/facing/beautyfeel/BeautyFeelServices";
import { isBeautyFeelSlug } from "@/components/facing/beautyfeel/content";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import BusinessFacingSkeleton from "@/components/skeletons/BusinessFacingSkeleton";
import { constructMetadata } from "@/lib/metadata";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";

interface Props {
  params: Promise<{ businessSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { businessSlug } = await params;
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { name: true, slug: true, description: true, imageUrl: true },
  });

  if (!business) {
    return constructMetadata({
      title: "Business Not Found",
      noIndex: true,
    });
  }

  return constructMetadata({
    title: `${business.name} Services | Book Online`,
    description:
      business.description ||
      `Explore ${business.name}'s services and book an appointment online.`,
    image: business.imageUrl || "/og-image.png",
    canonical: `/${business.slug}/services`,
    keywords: [
      `${business.name} services`,
      `${business.name} price list`,
      `book ${business.name} service`,
      `${business.name} online booking`,
      "salon and spa services",
    ],
  });
}

export default function BusinessServicesPage({ params }: Props) {
  return (
    <Suspense fallback={<BusinessFacingSkeleton variant="services" />}>
      <BusinessServicesContent params={params} />
    </Suspense>
  );
}

async function BusinessServicesContent({ params }: Props) {
  await connection();
  const { businessSlug } = await params;

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!business) {
    notFound();
  }

  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.website) {
    redirect(`/${businessSlug}/booking`);
  }

  const services = await prisma.service.findMany({
    where: { business_id: business.id },
    orderBy: [{ category: "asc" }, { price: "asc" }],
  });

  if (isBeautyFeelSlug(business.slug)) {
    return <BeautyFeelServices business={business} services={services} />;
  }

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <h1 className="text-3xl font-semibold">{business.name} Services</h1>
        <p className="text-muted-foreground">
          This business is still preparing their public services page. You can
          book an appointment online now.
        </p>
        <Button asChild>
          <Link href={`/${business.slug}/booking`}>Book now</Link>
        </Button>
      </div>
    </div>
  );
}
