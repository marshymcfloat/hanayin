import { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";

// Define the default configuration
const defaultTitle =
  "ServiceFlow | Salon & Spa Management Software Philippines";
const defaultDescription =
  "The all-in-one platform for salons, barbershops, and spas in the Philippines. Manage appointments, payroll, staff, and payments with ease. Try for free.";
const defaultUrl = getSiteUrl();
const coreKeywords = [
  "salon management software",
  "salon software philippines",
  "spa management software",
  "barbershop management software",
  "beauty salon software",
  "appointment scheduling software",
  "online booking software",
  "booking system philippines",
  "salon booking app",
  "spa booking app",
  "barbershop booking system",
  "beauty business software",
  "service business software",
  "point of sale for salon",
  "pos system philippines",
  "salon pos system",
  "spa pos software",
  "staff scheduling software",
  "employee scheduling app",
  "payroll software for salons",
  "commission tracking software",
  "customer management software",
  "crm for salons",
  "automated appointment reminders",
  "sms reminder software",
  "no-show reduction software",
  "multi-branch salon software",
  "business operations software",
  "small business booking software",
  "beauty clinic management system",
  "clinic appointment software",
  "wellness business software",
  "hair salon software",
  "nail salon software",
  "massage spa software",
  "beauty and wellness software",
  "online appointment philippines",
  "book salon appointment online",
  "book spa appointment online",
  "barber appointment app",
  "front desk software",
  "service marketplace philippines",
  "digital transformation for salons",
  "salon growth software",
  "salon analytics dashboard",
  "business management platform philippines",
];

type MetadataProps = {
  title?: string;
  description?: string;
  image?: string;
  icons?: string;
  noIndex?: boolean;
  canonical?: string;
  keywords?: string[];
};

function normalizeCanonical(canonical: string) {
  if (canonical.startsWith("http://") || canonical.startsWith("https://")) {
    return canonical;
  }

  return canonical.startsWith("/") ? canonical : `/${canonical}`;
}

function dedupeKeywords(extraKeywords: string[]) {
  return Array.from(
    new Set(
      [...coreKeywords, ...extraKeywords]
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  );
}

export function constructMetadata({
  title = defaultTitle,
  description = defaultDescription,
  image = "/og-image.png",
  icons = "/favicon.ico",
  noIndex = false,
  canonical = "/",
  keywords = [],
}: MetadataProps = {}): Metadata {
  const canonicalUrl = normalizeCanonical(canonical);

  return {
    title: {
      template: `%s | ServiceFlow`,
      default: title,
    },
    description,
    keywords: dedupeKeywords(keywords),
    authors: [{ name: "ServiceFlow Team" }],
    creator: "ServiceFlow",
    publisher: "ServiceFlow",
    applicationName: "ServiceFlow",
    category: "Business Software",
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "ServiceFlow",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: "en_PH",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
      creator: "@serviceflow_ph",
    },
    icons,
    metadataBase: new URL(defaultUrl),
    ...(noIndex && {
      robots: {
        index: false,
        follow: false,
      },
    }),
    alternates: {
      canonical: canonicalUrl,
    },
  };
}
