import { MetadataRoute } from "next";
import { connection } from "next/server";
import { prisma } from "@/prisma/prisma";
import { getSiteUrl } from "@/lib/site-url";
import { resolveEntitlements } from "@/lib/features/plan-entitlements";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const baseUrl = getSiteUrl();
  const lastModified = new Date().toISOString().split("T")[0];

  const reservedSlugs = new Set([
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
    "terms",
  ]);

  const routes = ["", "/apply", "/explore", "/privacy", "/terms"].map(
    (route) => ({
      url: `${baseUrl}${route}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: route === "" ? 1 : 0.8,
    }),
  );

  const publicBusinessRoutes = await prisma.business.findMany({
    select: {
      slug: true,
      updated_at: true,
      subscriptions: {
        take: 1,
        orderBy: { created_at: "desc" },
        select: {
          plan: {
            select: {
              code: true,
            },
          },
        },
      },
      _count: {
        select: {
          services: true,
        },
      },
    },
    orderBy: {
      updated_at: "desc",
    },
  });

  const dynamicRoutes = publicBusinessRoutes
    .filter((business) => !reservedSlugs.has(business.slug.toLowerCase()))
    .filter((business) => {
      const planCode = business.subscriptions[0]?.plan.code;
      return resolveEntitlements(planCode).website;
    })
    .flatMap((business) => {
      const lastBusinessUpdate = business.updated_at
        .toISOString()
        .split("T")[0];
      const businessRoutes: MetadataRoute.Sitemap = [
        {
          url: `${baseUrl}/${business.slug}`,
          lastModified: lastBusinessUpdate,
          changeFrequency: "daily",
          priority: 0.9,
        },
      ];

      if (business._count.services > 0) {
        businessRoutes.push({
          url: `${baseUrl}/${business.slug}/services`,
          lastModified: lastBusinessUpdate,
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }

      return businessRoutes;
    });

  return [...routes, ...dynamicRoutes];
}
