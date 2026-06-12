import { readFile } from "node:fs/promises";
import path from "node:path";

import { logger } from "@/lib/logger";

// Loads the same three TTFs that font-files.ts exposes to resvg-js, but as
// raw buffers — used to inline @font-face data URIs into the SVG <style>.
// Note: resvg-js ignores @font-face data: URIs (it only loads from file
// paths). The embedded data URIs are kept for any non-resvg consumer and
// for parity with the previous loader output.

type FontCache = {
  dmSans500: Buffer;
  dmSans700: Buffer;
  cormorantGaramond600: Buffer;
};

const FONT_DIR = path.join(process.cwd(), "lib", "services", "social", "fonts");

let cache: FontCache | null = null;
let inflight: Promise<FontCache | null> | null = null;

async function loadFonts(): Promise<FontCache | null> {
  try {
    const [dmSans500, dmSans700, cormorant600] = await Promise.all([
      readFile(path.join(FONT_DIR, "DMSans-Regular.ttf")),
      readFile(path.join(FONT_DIR, "DMSans-Bold.ttf")),
      readFile(path.join(FONT_DIR, "CormorantGaramond-SemiBold.ttf")),
    ]);

    return { dmSans500, dmSans700, cormorantGaramond600: cormorant600 };
  } catch (error) {
    logger.warn("[Social] Overlay font files missing; SVG will use system fonts.", {
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
  return inflight;
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
