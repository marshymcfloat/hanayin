import { MetadataRoute } from "next";
import { connection } from "next/server";
import { listPublicBusinessSitemapEntries } from "@/features/businesses/queries/public-sitemap";
import { getSiteUrl } from "@/lib/site-url";
import { seoLandingPages } from "@/lib/seo-landing-pages";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const baseUrl = getSiteUrl();
  const lastModified = new Date().toISOString().split("T")[0];

  const reservedSlugs = new Set([
    "about",
    "api",
    "app",
    "apply",
    "explore",
    "manifest.webmanifest",
    "monitoring",
    "platform",
    "privacy",
    "refer",
    "robots.txt",
    "sentry-example-page",
    "sitemap.xml",
    "solutions",
    "terms",
  ]);

  const routes = [
    "",
    "/about",
    "/apply",
    "/explore",
    "/privacy",
    "/solutions",
    "/terms",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority:
      route === ""
        ? 1
        : route === "/about"
          ? 0.7
          : route === "/solutions"
            ? 0.85
            : 0.8,
  }));

  const solutionRoutes: MetadataRoute.Sitemap = seoLandingPages.map((page) => ({
    url: `${baseUrl}/solutions/${page.slug}`,
    lastModified,
    changeFrequency: "weekly",
    priority: 0.78,
  }));

  const publicBusinessRoutes = await listPublicBusinessSitemapEntries();

  const dynamicRoutes = publicBusinessRoutes
    .filter((business) => !reservedSlugs.has(business.slug.toLowerCase()))
    .flatMap((business) => {
      const lastBusinessUpdate = business.updatedAt.toISOString().split("T")[0];
      const businessRoutes: MetadataRoute.Sitemap = [
        {
          url: `${baseUrl}/${business.slug}`,
          lastModified: lastBusinessUpdate,
          changeFrequency: "daily",
          priority: 0.9,
        },
      ];

      if (business.hasServices) {
        businessRoutes.push({
          url: `${baseUrl}/${business.slug}/services`,
          lastModified: lastBusinessUpdate,
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }

      return businessRoutes;
    });

  return [...routes, ...solutionRoutes, ...dynamicRoutes];
}
