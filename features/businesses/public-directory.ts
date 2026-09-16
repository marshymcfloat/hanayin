import { prisma } from "@/prisma/prisma";
import { toAbsoluteUrl } from "@/lib/site-url";

const publicBusinessMetadataSelect = {
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
} as const;

export function getPublicBusinessMetadata(slug: string) {
  return prisma.business.findUnique({
    where: { slug },
    select: publicBusinessMetadataSelect,
  });
}

export function listPublicDirectoryBusinesses() {
  return prisma.business.findMany({
    where: {
      subscriptions: {
        some: {
          status: { notIn: ["SUSPENDED", "CANCELED"] },
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      initials: true,
      imageUrl: true,
      description: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getPublicBusinessProfile(slug: string, now = new Date()) {
  const business = await prisma.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      latitude: true,
      longitude: true,
      business_hours: true,
    },
  });

  if (!business) return null;

  const [services, saleEvents] = await Promise.all([
    prisma.service.findMany({
      where: { business_id: business.id },
      orderBy: [{ category: "asc" }, { price: "asc" }],
    }),
    prisma.saleEvent.findMany({
      where: {
        business_id: business.id,
        start_date: { lte: now },
        end_date: { gte: now },
      },
      orderBy: { start_date: "desc" },
      take: 4,
    }),
  ]);

  return { business, services, saleEvents };
}

export async function getPublicBusinessServices(slug: string) {
  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  if (!business) return null;

  const services = await prisma.service.findMany({
    where: { business_id: business.id },
    orderBy: [{ category: "asc" }, { price: "asc" }],
  });

  return { business, services };
}

type PublicBusinessSchemaInput = {
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  business_hours: Array<{
    category: string;
    day_of_week: number;
    open_time: string;
    close_time: string;
  }>;
};

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function buildLocalBusinessJsonLd(
  business: PublicBusinessSchemaInput,
  sameAs?: string[],
) {
  const generalHours = business.business_hours.filter(
    (hour) => hour.category === "GENERAL",
  );
  const hours = generalHours.length > 0 ? generalHours : business.business_hours;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: business.name,
    url: toAbsoluteUrl(`/${business.slug}`),
    image: business.imageUrl || toAbsoluteUrl("/og-image.png"),
    priceRange: "PHP",
    description: business.description || undefined,
    openingHoursSpecification: hours.map((hour) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAY_LABELS[hour.day_of_week],
      opens: hour.open_time,
      closes: hour.close_time,
    })),
  };

  if (business.latitude != null && business.longitude != null) {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: business.latitude,
      longitude: business.longitude,
    };
  }
  if (sameAs?.length) jsonLd.sameAs = sameAs;

  return jsonLd;
}
