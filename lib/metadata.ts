import { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";

// Define the default configuration
const defaultTitle =
  "ServiceFlow | Salon & Spa Management Software Philippines";
const defaultDescription =
  "The all-in-one platform for salons, barbershops, and spas in the Philippines. Manage appointments, payroll, staff, and payments with ease. Try for free.";
const defaultUrl = getSiteUrl();

type MetadataProps = {
  title?: string;
  description?: string;
  image?: string;
  icons?: string;
  noIndex?: boolean;
  canonical?: string;
};

function normalizeCanonical(canonical: string) {
  if (canonical.startsWith("http://") || canonical.startsWith("https://")) {
    return canonical;
  }

  return canonical.startsWith("/") ? canonical : `/${canonical}`;
}

export function constructMetadata({
  title = defaultTitle,
  description = defaultDescription,
  image = "/og-image.png",
  icons = "/favicon.ico",
  noIndex = false,
  canonical = "/",
}: MetadataProps = {}): Metadata {
  const canonicalUrl = normalizeCanonical(canonical);

  return {
    title: {
      template: `%s | ServiceFlow`,
      default: title,
    },
    description,
    keywords: [
      "salon management software philippines",
      "spa booking system",
      "barbershop pos philippines",
      "online appointment scheduling",
      "best salon software free",
      "payroll for salons",
      "beauty clinic management system",
    ],
    authors: [{ name: "ServiceFlow Team" }],
    creator: "ServiceFlow",
    publisher: "ServiceFlow",
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
