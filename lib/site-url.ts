const DEFAULT_SITE_URL = "https://www.serviceflow.store";

function normalizeBaseUrl(rawUrl: string) {
  const value = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const url = new URL(value);
  return url.toString().replace(/\/$/, "");
}

function isLocalUrl(rawUrl: string) {
  try {
    const { hostname } = new URL(normalizeBaseUrl(rawUrl));
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch {
    return false;
  }
}

export function getSiteUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    DEFAULT_SITE_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (process.env.NODE_ENV === "production" && isLocalUrl(candidate))
      continue;

    try {
      return normalizeBaseUrl(candidate);
    } catch {
      // Continue to the next configured or platform-provided URL.
    }
  }

  return DEFAULT_SITE_URL;
}

export function toAbsoluteUrl(pathname = "/") {
  return new URL(pathname, `${getSiteUrl()}/`).toString();
}
