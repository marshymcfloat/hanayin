const isProduction = process.env.NODE_ENV === "production";

function parseCspList(envValue: string | undefined) {
  if (!envValue) return [];
  return envValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

// Vercel Analytics & Speed Insights load from these CDN/ingest endpoints.
// Whitelisted unconditionally so analytics works in dev and prod.
const VERCEL_ANALYTICS_SCRIPTS = ["https://va.vercel-scripts.com"];
const VERCEL_ANALYTICS_CONNECT = [
  "https://vitals.vercel-insights.com",
  "https://vercel.live",
];

const connectSrc = [
  "'self'",
  ...VERCEL_ANALYTICS_CONNECT,
  ...parseCspList(process.env.NEXT_PUBLIC_CSP_CONNECT_SRC),
];

// Google Maps embeds (used by customer-facing storefronts via the
// "Share → Embed a map" iframe). Whitelisted in frame-src so the
// browser doesn't block the iframe.
const GOOGLE_MAPS_FRAMES = [
  "https://www.google.com",
  "https://maps.google.com",
];

const frameSrc = [
  "'self'",
  ...GOOGLE_MAPS_FRAMES,
  ...parseCspList(process.env.NEXT_PUBLIC_CSP_FRAME_SRC),
];

const scriptSrc = ["'self'", "'unsafe-inline'", ...VERCEL_ANALYTICS_SCRIPTS];

const contentSecurityPolicyDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `script-src ${scriptSrc.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  `connect-src ${connectSrc.join(" ")}`,
  `frame-src ${frameSrc.join(" ")}`,
  "worker-src 'self' blob:",
];

if (isProduction) {
  contentSecurityPolicyDirectives.push("upgrade-insecure-requests");
}

export const CONTENT_SECURITY_POLICY =
  contentSecurityPolicyDirectives.join("; ");

export const SECURITY_HEADERS = {
  "X-DNS-Prefetch-Control": "on",
  ...(isProduction
    ? {
        "Strict-Transport-Security":
          "max-age=63072000; includeSubDomains; preload",
      }
    : {}),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
} as const;
