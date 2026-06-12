import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./lib/security/headers";

const nextConfig: NextConfig = {
  // Required by `"use cache"` directives in lib/data/cached.ts. NextAuth's
  // catch-all route handler explicitly opts out via `dynamic = "force-dynamic"`
  // so it doesn't get prerender-cached. Other routes that need uncached
  // behavior should add the same opt-out.
  cacheComponents: true,
  // Native modules: Turbopack can't statically resolve their platform-specific
  // binaries (e.g. @resvg/resvg-js-win32-x64-msvc). Listing them here keeps
  // them as runtime requires resolved from node_modules.
  serverExternalPackages: ["@resvg/resvg-js"],
  images: {
    // Some local networks/ISPs use DNS64/NAT64 (64:ff9b::/96), which Next.js
    // can classify as private even for public hosts. Keep this dev-only.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
    localPatterns: [{ pathname: "/**" }],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({
          key,
          value,
        })),
      },
    ];
  },
};

const sentryOptions = {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "daniel-q7",

  project: "serviceflow",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
};

export default process.env.NODE_ENV === "development"
  ? nextConfig
  : withSentryConfig(nextConfig, sentryOptions);
