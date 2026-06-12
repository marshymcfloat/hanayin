import { getSiteUrl } from "@/lib/site-url";

export function organizationSchema() {
  const baseUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ServiceFlow",
    url: baseUrl,
    logo: `${baseUrl}/logo.png`,
    sameAs: [
      "https://twitter.com/serviceflow",
      "https://facebook.com/serviceflow",
      // Add other social links here
    ],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+639951804645",
      contactType: "customer service",
      areaServed: "PH",
      availableLanguage: ["en", "fil"],
    },
  };
}

export function websiteSchema() {
  const baseUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ServiceFlow",
    url: baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseUrl}/explore?query={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function softwareApplicationSchema() {
  const baseUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ServiceFlow",
    url: baseUrl,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "ServiceFlow is an all-in-one platform for salons, barbershops, and spas to manage bookings, staff, payroll, and growth.",
    areaServed: "PH",
    creator: {
      "@type": "Organization",
      name: "ServiceFlow",
      url: baseUrl,
    },
    featureList: [
      "Online appointment scheduling",
      "Salon and spa POS workflows",
      "Staff scheduling and commission tracking",
      "Automated booking reminders",
      "Business analytics and reporting",
    ],
  };
}

export function breadcrumbSchema(items: { name: string; item: string }[]) {
  const baseUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item.startsWith("http") ? item.item : `${baseUrl}${item.item}`,
    })),
  };
}

export function itemListSchema(
  items: { name: string; url: string; image?: string; description?: string }[],
) {
  const baseUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: item.url.startsWith("http") ? item.url : `${baseUrl}${item.url}`,
      name: item.name,
      ...(item.image ? { image: item.image } : {}),
      ...(item.description ? { description: item.description } : {}),
    })),
  };
}
