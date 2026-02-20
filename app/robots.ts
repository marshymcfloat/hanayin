import { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api",
        "/api/",
        "/app",
        "/app/",
        "/platform",
        "/platform/",
        "/monitoring",
        "/apply/status",
        "/refer",
        "/refer/",
        "/sentry-example-page",
      ],
    },
    host: baseUrl,
    sitemap: [`${baseUrl}/sitemap.xml`],
  };
}
