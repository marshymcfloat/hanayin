const isProduction = process.env.NODE_ENV === "production";

function parseCspList(envValue: string | undefined) {
  if (!envValue) return [];
  return envValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const connectSrc = [
  "'self'",
  ...parseCspList(process.env.NEXT_PUBLIC_CSP_CONNECT_SRC),
];

const frameSrc = [
  "'self'",
  ...parseCspList(process.env.NEXT_PUBLIC_CSP_FRAME_SRC),
];

const contentSecurityPolicyDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src ${connectSrc.join(" ")}`,
  `frame-src ${frameSrc.join(" ")}`,
  "worker-src 'self' blob:",
];

if (isProduction) {
  contentSecurityPolicyDirectives.push("upgrade-insecure-requests");
}

export const CONTENT_SECURITY_POLICY = contentSecurityPolicyDirectives.join("; ");

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
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
} as const;
