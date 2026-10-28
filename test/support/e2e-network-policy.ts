export function shouldBlockSmokeRequest(target: string, baseURL: string): boolean {
  try {
    const base = new URL(baseURL);
    const url = new URL(target);
    if (url.protocol === "data:" || url.protocol === "blob:") return false;
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== base.origin) return true;
    if (["/monitoring", "/_vercel/insights", "/_vercel/speed-insights"].some(path => url.pathname === path || url.pathname.startsWith(`${path}/`))) return true;
    if (url.pathname === "/_next/image") {
      const source = url.searchParams.get("url");
      if (!source) return true;
      const image = new URL(source, base);
      return image.origin !== base.origin;
    }
    return false;
  } catch { return true; }
}
