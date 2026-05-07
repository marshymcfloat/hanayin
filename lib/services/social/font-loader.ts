import { logger } from "@/lib/logger";

// Fetches Google Fonts in TTF format (via old User-Agent) and caches them.
// We expose two shapes:
//   - getEmbeddedFontStyles(): @font-face CSS with base64 data URIs (legacy
//     consumers and any non-resvg renderer fallback).
//   - getFontBuffers(): raw TTF buffers, fed directly to @resvg/resvg-js
//     because librsvg (the SVG engine inside Sharp) does NOT reliably load
//     fonts from data: URIs and renders text as tofu/squares.

type FontCache = {
  dmSans500: Buffer;
  dmSans700: Buffer;
  cormorantGaramond600: Buffer;
};

let cache: FontCache | null = null;
let inflight: Promise<FontCache | null> | null = null;

// Old UA → Google Fonts returns TTF (not woff2).
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

async function toBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
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

    const [dmSans500, dmSans700, cormorant600] = await Promise.all([
      toBuffer(dmSansUrls[0] ?? ""),
      toBuffer(dmSansUrls[1] ?? dmSansUrls[0] ?? ""),
      toBuffer(cormorantUrls[0] ?? ""),
    ]);

    if (!dmSans500 || !cormorant600) return null;

    return {
      dmSans500,
      dmSans700: dmSans700 ?? dmSans500,
      cormorantGaramond600: cormorant600,
    };
  } catch (error) {
    logger.warn("[Social] Font pre-load failed; SVG will use system fonts.", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function ensureCache(): Promise<FontCache | null> {
  if (cache) return cache;
  if (!inflight) {
    inflight = loadFonts().then((result) => {
      cache = result;
      inflight = null;
      return result;
    });
  }
  try {
    await Promise.race([
      inflight,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 8000),
      ),
    ]);
  } catch {
    // timed out — caller falls back to system fonts
  }
  return cache;
}

export async function getFontBuffers(): Promise<Buffer[]> {
  const c = await ensureCache();
  if (!c) return [];
  return [c.dmSans500, c.dmSans700, c.cormorantGaramond600];
}

export async function getEmbeddedFontStyles(): Promise<string> {
  const c = await ensureCache();

  if (!c) {
    return `
      .brand { font-family: 'DM Sans','Liberation Sans','DejaVu Sans',Arial,sans-serif; font-weight: 500; font-size: 26px; letter-spacing: 0.18em; fill: rgba(255,255,255,0.92); }
      .headline { font-family: 'Cormorant Garamond','Liberation Serif','DejaVu Serif',Georgia,serif; font-weight: 600; font-size: 84px; fill: #ffffff; }
      .discount { font-family: 'DM Sans','Liberation Sans','DejaVu Sans',Arial,sans-serif; font-weight: 700; font-size: 64px; letter-spacing: 0.04em; fill: #ffffff; }
      .date { font-family: 'DM Sans','Liberation Sans','DejaVu Sans',Arial,sans-serif; font-weight: 600; font-size: 28px; letter-spacing: 0.16em; fill: rgba(255,255,255,0.86); }
      .cta { font-family: 'DM Sans','Liberation Sans','DejaVu Sans',Arial,sans-serif; font-weight: 500; font-size: 24px; letter-spacing: 0.06em; fill: rgba(255,255,255,0.78); }
    `;
  }

  const dmSans500b64 = c.dmSans500.toString("base64");
  const dmSans700b64 = c.dmSans700.toString("base64");
  const cormorant600b64 = c.cormorantGaramond600.toString("base64");

  const dmSansSrc = `url('data:font/ttf;base64,${dmSans500b64}') format('truetype')`;
  const dmSansBoldSrc = `url('data:font/ttf;base64,${dmSans700b64}') format('truetype')`;
  const cormorantSrc = `url('data:font/ttf;base64,${cormorant600b64}') format('truetype')`;

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
