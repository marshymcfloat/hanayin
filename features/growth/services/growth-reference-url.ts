export function isOwnedGrowthReferenceUrl(urlValue: string, storageKey: string, businessSlug: string) {
  try {
    const url = new URL(urlValue);
    const path = decodeURIComponent(url.pathname);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname)) return false;
    if (path !== `/${storageKey}` || storageKey.includes("\\") || storageKey.includes("%") || storageKey.split("/").some(segment => !segment || segment === "." || segment === "..")) return false;
    return storageKey.startsWith(`${businessSlug}/brand/reference/`) || storageKey.startsWith(`brand-assets/${businessSlug}/references/`);
  } catch { return false; }
}
