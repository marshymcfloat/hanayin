import { logger } from "@/lib/logger";

// Fetches Google Fonts in TTF format (via old User-Agent) and caches them
// as base64 for embedding in SVG @font-face. librsvg (used by Sharp) cannot
// load system fonts like DM Sans/Cormorant — embedding is the only reliable
// path on serverless deployments.

type FontCache = {
  dmSans500: string;
  dmSans700: string;
  cormorantGaramond600: string;
};

let cache: FontCache | null = null;
let inflight: Promise<FontCache | null> | null = null;

// Old UA → Google Fonts returns TTF (not woff2). librsvg supports TTF data URIs.
const TTF_UA = "Mozilla/4.0 (compatible; MSIE 6.0)";

async function fetchCss(family: string): Promise<string | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
    const res = await fetch(url, { headers: { "User-Agent": TTF_UA } });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

function parseSrcUrls(css: string): string[] {
  const urls: string[] = [];
  const re = /src:\s*[^;]*url\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    urls.push(m[1].replace(/['"]/g, "").trim());
  }
  return urls;
}

async function toBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

async function loadFonts(): Promise<FontCache | null> {
  try {
    const [dmSansCss, cormorantCss] = await Promise.all([
      fetchCss("DM+Sans:wght@500;700"),
      fetchCss("Cormorant+Garamond:wght@600"),
    ]);

    if (!dmSansCss || !cormorantCss) return null;

    const dmSansUrls = parseSrcUrls(dmSansCss);
    const cormorantUrls = parseSrcUrls(cormorantCss);

    // Google Fonts returns one @font-face per weight when multiple are requested.
    // For TTF UA the order matches the request order: 500 first, 700 second.
    const [dmSans500b64, dmSans700b64, cormorant600b64] = await Promise.all([
      toBase64(dmSansUrls[0] ?? ""),
      toBase64(dmSansUrls[1] ?? dmSansUrls[0] ?? ""),
      toBase64(cormorantUrls[0] ?? ""),
    ]);

    if (!dmSans500b64 || !cormorant600b64) return null;

    return {
      dmSans500: dmSans500b64,
      dmSans700: dmSans700b64 ?? dmSans500b64,
      cormorantGaramond600: cormorant600b64,
    };
  } catch (error) {
    logger.warn("[Social] Font pre-load failed; SVG will use system fonts.", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getEmbeddedFontStyles(): Promise<string> {
  if (!cache) {
    if (!inflight) {
      inflight = loadFonts().then((result) => {
        cache = result;
        inflight = null;
        return result;
      });
    }
    try {
      await Promise.race([inflight, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000))]);
    } catch {
      // Font fetch timed out — fall through to system fonts
    }
  }

  if (!cache) {
    // Graceful fallback: use whatever system fonts are available. Text will
    // render but may not match the design intent.
    return `
      .brand { font-family: 'Liberation Sans','DejaVu Sans',Arial,sans-serif; font-weight: 500; font-size: 26px; letter-spacing: 0.18em; fill: rgba(255,255,255,0.92); }
      .headline { font-family: 'Liberation Serif','DejaVu Serif',Georgia,serif; font-weight: 600; font-size: 84px; fill: #ffffff; }
      .discount { font-family: 'Liberation Sans','DejaVu Sans',Arial,sans-serif; font-weight: 700; font-size: 64px; letter-spacing: 0.04em; fill: #ffffff; }
      .date { font-family: 'Liberation Sans','DejaVu Sans',Arial,sans-serif; font-weight: 600; font-size: 28px; letter-spacing: 0.16em; fill: rgba(255,255,255,0.86); }
      .cta { font-family: 'Liberation Sans','DejaVu Sans',Arial,sans-serif; font-weight: 500; font-size: 24px; letter-spacing: 0.06em; fill: rgba(255,255,255,0.78); }
    `;
  }

  const dmSansSrc = `url('data:font/ttf;base64,${cache.dmSans500}') format('truetype')`;
  const dmSansBoldSrc = `url('data:font/ttf;base64,${cache.dmSans700}') format('truetype')`;
  const cormorantSrc = `url('data:font/ttf;base64,${cache.cormorantGaramond600}') format('truetype')`;

  return `
    @font-face { font-family: 'DM Sans'; font-weight: 500; src: ${dmSansSrc}; }
    @font-face { font-family: 'DM Sans'; font-weight: 600; src: ${dmSansSrc}; }
    @font-face { font-family: 'DM Sans'; font-weight: 700; src: ${dmSansBoldSrc}; }
    @font-face { font-family: 'Cormorant Garamond'; font-weight: 600; src: ${cormorantSrc}; }
    .brand { font-family: 'DM Sans',Arial,sans-serif; font-weight: 500; font-size: 26px; letter-spacing: 0.18em; fill: rgba(255,255,255,0.92); }
    .headline { font-family: 'Cormorant Garamond',Georgia,serif; font-weight: 600; font-size: 84px; fill: #ffffff; }
    .discount { font-family: 'DM Sans',Arial,sans-serif; font-weight: 700; font-size: 64px; letter-spacing: 0.04em; fill: #ffffff; }
    .date { font-family: 'DM Sans',Arial,sans-serif; font-weight: 600; font-size: 28px; letter-spacing: 0.16em; fill: rgba(255,255,255,0.86); }
    .cta { font-family: 'DM Sans',Arial,sans-serif; font-weight: 500; font-size: 24px; letter-spacing: 0.06em; fill: rgba(255,255,255,0.78); }
  `;
}
