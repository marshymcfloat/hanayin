import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

import { logger } from "@/lib/logger";
import { DiscountType } from "@/prisma/generated/prisma/enums";
import { getEmbeddedFontStyles } from "@/lib/services/social/font-loader";
import { getOverlayFontFiles } from "@/lib/services/social/font-files";

/**
 * Rasterize an SVG overlay to PNG using @resvg/resvg-js. We do this instead
 * of letting Sharp consume the SVG directly: Sharp uses librsvg, which does
 * not reliably load fonts from `@font-face` data URIs and renders text as
 * missing-glyph tofu boxes. resvg-js loads fonts from real files and
 * additionally honors `@font-face` data URIs in the SVG itself, so glyphs
 * render deterministically across platforms.
 */
async function rasterizeOverlaySvg(svg: Buffer): Promise<Buffer> {
  let fontFiles: string[] = [];
  try {
    fontFiles = await getOverlayFontFiles();
  } catch (error) {
    logger.warn("[Social] Overlay font materialization failed; using system fonts.", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const resvg = new Resvg(svg, {
      background: "rgba(0,0,0,0)",
      font: {
        fontFiles,
        // Always allow system-font fallback. If the Google Fonts fetch failed
        // and we set loadSystemFonts:false, resvg has no fonts at all and
        // text effectively disappears. Better to render in a system font than
        // nothing.
        loadSystemFonts: true,
        defaultFontFamily: "DM Sans",
        serifFamily: "Cormorant Garamond",
        sansSerifFamily: "DM Sans",
      },
    });
    return Buffer.from(resvg.render().asPng());
  } catch (error) {
    // Re-throw so the outer compose try/catch logs and falls back to the raw
    // background. We log here too so the failing step is unambiguous.
    logger.error("[Social] Resvg rasterization failed.", {
      errorMessage: error instanceof Error ? error.message : String(error),
      fontFileCount: fontFiles.length,
      svgPreview: svg.toString("utf8").slice(0, 240),
    });
    throw error;
  }
}

// ─── Layout constants (portrait 1024×1536 — Instagram & Facebook safe) ──────

const W = 1024;
const H = 1536;
const PAD = 76; // Generous side padding so headlines never hug the canvas edge.

// Headline rendering. Cormorant Garamond at 84px renders roughly 0.55 × fontSize
// per character on average mixed-case text — used as a width estimator below
// so we can detect overflow without measuring rendered glyphs.
const HEADLINE_FONT_SIZE = 84;
const HEADLINE_AVG_CHAR_WIDTH_FACTOR = 0.55;
const HEADLINE_MAX_WIDTH = W - PAD * 2;
const HEADLINE_MAX_CHARS_PER_LINE = 18; // Conservative: serif + caps ≈ wider real width.
const HEADLINE_MAX_LINES = 3;

// Maximum lengths for safety. Keep text tight so the SVG renderer never wraps
// awkwardly. We also clip on word boundaries below.
const FIELD_LIMITS = {
  businessName: 32,
  headline: 44,
  dateLabel: 24,
  discountLabel: 14,
  ctaLabel: 28,
} as const;

// ─── Public API ─────────────────────────────────────────────────────────────

export type SalePromoOverlayInput = {
  businessName: string;
  headline: string;
  discountType?: DiscountType;
  discountValue?: number;
  startDate: Date;
  endDate: Date;
  /**
   * If true, the discount is suppressed (e.g. SOCIAL_ONLY / AWARENESS posts).
   */
  isNonDiscount?: boolean;
};

export type OrganicOverlayInput = {
  businessName: string;
};

/**
 * H6 / K2: input for an educational tip-card overlay. The headline is the
 * post's topic (e.g. "Top 3 winter skincare tips"), wrapped onto up to 3
 * lines and placed in the upper third of the frame. The optional `tips`
 * array — up to 3 short bullet strings — renders below the headline as
 * a compact list, mirroring how successful Instagram tip cards present
 * standalone-readable content. Falls back gracefully to title-only when
 * `tips` is empty or undefined.
 */
export type EducationalOverlayInput = {
  businessName: string;
  headline: string;
  tips?: string[];
};

// Wave N2: editorial tip-list constants. The previous dark "card panel"
// design read like a slide deck and clashed with premium spa photography.
// Now type lives directly in the photograph, supported only by a subtle
// scrim, a hairline indent rule, and a drop-shadow on the glyphs for
// legibility. Two tips max — anything more starts to feel cluttered.
const TIP_FONT_SIZE = 30;
const TIP_AVG_CHAR_WIDTH_FACTOR = 0.5;
const TIP_LINE_HEIGHT = 46;
const TIP_MAX_CHARS_PER_LINE = 36;
const TIP_MAX_LINES_PER_TIP = 3;
const TIP_MAX_COUNT = 2;
const TIP_INTER_GAP = 30;
const TIP_NUMERAL_FONT_SIZE = 28;
const TIP_TEXT_INDENT = 56; // space reserved on the left for the small numeral
const ACCENT = "#E8D7B7"; // warm cream — feels editorial, not "logo gold"
const TIP_MAX_WIDTH = W - PAD * 2 - TIP_TEXT_INDENT;

/**
 * Compose a sale-event promo overlay onto a background image. Returns the
 * composed PNG bytes. If sharp throws, we fall back to returning the original
 * background bytes — the caller already uploaded an image worth shipping.
 */
export async function composeSalePromoOverlay(
  background: Buffer,
  input: SalePromoOverlayInput,
): Promise<{ bytes: Buffer; mimeType: "image/png" }> {
  try {
    const overlaySvg = await renderSaleOverlaySvg(input);
    const overlayPng = await rasterizeOverlaySvg(overlaySvg);
    const bytes = await sharp(background)
      .resize(W, H, { fit: "cover", position: "centre" })
      .composite([{ input: overlayPng, top: 0, left: 0 }])
      .png({ quality: 92 })
      .toBuffer();
    return { bytes, mimeType: "image/png" };
  } catch (error) {
    logger.error(
      "[Social] Promo overlay composition failed; returning raw background (text will be missing).",
      {
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    );
    return { bytes: background, mimeType: "image/png" };
  }
}

/**
 * Stamp just the business name into a clean top-left position. Used for
 * organic posts where the owner wants a subtle brand mark on the image.
 */
export async function composeBusinessNameWatermark(
  background: Buffer,
  input: OrganicOverlayInput,
): Promise<{ bytes: Buffer; mimeType: "image/png" }> {
  try {
    const overlaySvg = await renderWatermarkSvg(input);
    const overlayPng = await rasterizeOverlaySvg(overlaySvg);
    const bytes = await sharp(background)
      .resize(W, H, { fit: "cover", position: "centre" })
      .composite([{ input: overlayPng, top: 0, left: 0 }])
      .png({ quality: 92 })
      .toBuffer();
    return { bytes, mimeType: "image/png" };
  } catch (error) {
    logger.error(
      "[Social] Watermark composition failed; returning raw background (text will be missing).",
      {
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    );
    return { bytes: background, mimeType: "image/png" };
  }
}

/**
 * H6: compose an educational tip-card overlay. Renders a centered headline in
 * the upper third of the frame plus a small bottom-left business-name
 * watermark. Designed to pair with the EDUCATIONAL image profile, which
 * generates a flat-lay with intentional whitespace at the top.
 */
export async function composeEducationalOverlay(
  background: Buffer,
  input: EducationalOverlayInput,
): Promise<{ bytes: Buffer; mimeType: "image/png" }> {
  try {
    const overlaySvg = await renderEducationalOverlaySvg(input);
    const overlayPng = await rasterizeOverlaySvg(overlaySvg);
    const bytes = await sharp(background)
      .resize(W, H, { fit: "cover", position: "centre" })
      .composite([{ input: overlayPng, top: 0, left: 0 }])
      .png({ quality: 92 })
      .toBuffer();
    return { bytes, mimeType: "image/png" };
  } catch (error) {
    logger.error(
      "[Social] Educational overlay composition failed; returning raw background (text will be missing).",
      {
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    );
    return { bytes: background, mimeType: "image/png" };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clampWords(value: string, maxLength: number) {
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  // Cut on a word boundary, then trim trailing punctuation, then add ellipsis.
  const sliced = collapsed.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const tail = lastSpace > maxLength - 12 ? sliced.slice(0, lastSpace) : sliced;
  return `${tail.replace(/[.,;:!?\-–—]+$/, "").trim()}…`;
}

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Build the date label that appears in the overlay. The label varies by
 * whether the post carries an actual discount:
 *
 *   - DISCOUNT same-day  → "FLASH SALE — TODAY ONLY"  (urgency drum-beat)
 *   - DISCOUNT range     → "APR 27 – APR 30"
 *   - non-discount same-day → "BOOK TODAY"  (no fake urgency)
 *   - non-discount range    → "BOOK BY APR 30"
 *
 * Previously the function hardcoded "FLASH SALE" for every same-day window,
 * which produced contradictions like a "Weekend Prep Reminder" headline with
 * a "FLASH SALE — TODAY ONLY" badge underneath. The two labels imply
 * different campaign types.
 */
export function buildOverlayDateLabel(
  startDate: Date,
  endDate: Date,
  options: { isNonDiscount?: boolean } = {},
): string {
  const sameDay = isSameCalendarDay(startDate, endDate);
  const formatter = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
  });

  if (options.isNonDiscount) {
    if (sameDay) return "BOOK TODAY";
    return `BOOK BY ${formatter.format(endDate).toUpperCase()}`;
  }

  if (sameDay) return "FLASH SALE — TODAY ONLY";
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`.toUpperCase();
}

function formatDiscountLabel(
  discountType?: DiscountType,
  discountValue?: number,
): string | null {
  if (!discountType || !discountValue || discountValue <= 0) return null;
  if (discountType === "PERCENTAGE") {
    return `${Math.round(discountValue)}% OFF`;
  }
  return `₱${Math.round(discountValue).toLocaleString("en-PH")} OFF`;
}

/**
 * Wrap a single line of text into up to `maxLines` lines that fit roughly
 * within `maxChars` characters per line. Returns the trimmed lines.
 */
function wrapForOverlay(
  value: string,
  maxChars: number,
  maxLines: number,
): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      if (lines.length >= maxLines) {
        current = "";
        break;
      }
      current = word;
    } else {
      // Word longer than line: hard-break.
      lines.push(word);
      if (lines.length >= maxLines) {
        current = "";
        break;
      }
      current = "";
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

// ─── SVG renderers ──────────────────────────────────────────────────────────

async function renderSaleOverlaySvg(input: SalePromoOverlayInput) {
  const fontStyles = await getEmbeddedFontStyles();
  const businessName = clampWords(input.businessName, FIELD_LIMITS.businessName);
  const headlineFull = clampWords(input.headline, FIELD_LIMITS.headline);
  const dateLabel = clampWords(
    buildOverlayDateLabel(input.startDate, input.endDate, {
      isNonDiscount: input.isNonDiscount,
    }),
    FIELD_LIMITS.dateLabel,
  );
  const discountLabel = input.isNonDiscount
    ? null
    : formatDiscountLabel(input.discountType, input.discountValue);

  // Wrap the headline conservatively, then add a per-line textLength fallback
  // for any line whose estimated rendered width still exceeds the safe zone.
  // Without the fallback, capital-heavy serif text like "Weekend Prep Reminder"
  // would slide off the right edge — chars-per-line wrapping alone is not
  // pixel-aware.
  const headlineLines = wrapForOverlay(
    headlineFull,
    HEADLINE_MAX_CHARS_PER_LINE,
    HEADLINE_MAX_LINES,
  );

  const headlineLineHeight = 92;
  const headlineBaseY = H - PAD - 220; // anchor area for the bottom block
  const headlineSvg = headlineLines
    .map((line, index) => {
      const y =
        headlineBaseY -
        (headlineLines.length - 1 - index) * headlineLineHeight;
      const estimatedWidth =
        line.length * HEADLINE_FONT_SIZE * HEADLINE_AVG_CHAR_WIDTH_FACTOR;
      const fitAttrs =
        estimatedWidth > HEADLINE_MAX_WIDTH
          ? ` textLength="${HEADLINE_MAX_WIDTH}" lengthAdjust="spacingAndGlyphs"`
          : "";
      return `<text x="${PAD}" y="${y}" class="headline"${fitAttrs}>${escapeXml(line)}</text>`;
    })
    .join("");

  // Eyebrow above the headline — different label depending on the campaign.
  // Adds editorial structure that the previous "all text dumped at the
  // bottom" layout was missing.
  const eyebrowLabel = input.isNonDiscount ? "FEATURED" : "SPECIAL OFFER";
  const headlineTopY =
    headlineBaseY - (headlineLines.length - 1) * headlineLineHeight;
  const eyebrowSvg = `<text x="${PAD}" y="${headlineTopY - 56}" class="sale-eyebrow">${escapeXml(eyebrowLabel)}</text>`;

  // Hairline accent rule — same gesture used in the educational overlay.
  const ruleY = headlineTopY - 30;
  const ruleSvg = `<line x1="${PAD}" y1="${ruleY}" x2="${PAD + 76}" y2="${ruleY}" stroke="${ACCENT}" stroke-width="1.5" stroke-linecap="square" />`;

  const discountSvg = discountLabel
    ? `<text x="${PAD}" y="${H - PAD - 130}" class="discount">${escapeXml(discountLabel)}</text>`
    : "";

  const dateY = discountLabel ? H - PAD - 70 : H - PAD - 100;
  const dateSvg = `<text x="${PAD}" y="${dateY}" class="date">${escapeXml(dateLabel)}</text>`;

  // Replaced raw URL with a softer engagement nudge.  The previous
  // "→ serviceflow.store" rendered like a banner ad.
  const ctaSvg = `<text x="${W - PAD}" y="${H - PAD}" class="cta" text-anchor="end">Tap to learn more  →</text>`;

  // Brand at top-left with a small accent dot.
  const brandSvg = `
    <circle cx="${PAD + 2}" cy="${PAD + 22}" r="3" fill="${ACCENT}" />
    <text x="${PAD + 18}" y="${PAD + 28}" class="brand">${escapeXml(businessName.toUpperCase())}</text>
  `;

  // Layered scrims: top for brand contrast, bottom for headline/CTA contrast.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bottomScrim" x1="0" y1="${H * 0.45}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgb(8,12,16)" stop-opacity="0"/>
      <stop offset="0.5" stop-color="rgb(8,12,16)" stop-opacity="0.6"/>
      <stop offset="1" stop-color="rgb(8,12,16)" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="${PAD * 2.2}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgb(8,12,16)" stop-opacity="0.45"/>
      <stop offset="1" stop-color="rgb(8,12,16)" stop-opacity="0"/>
    </linearGradient>
    <style>
      ${fontStyles}
      .sale-eyebrow {
        font-family: 'DM Sans', Arial, sans-serif;
        font-weight: 600;
        font-size: 22px;
        letter-spacing: 0.32em;
        fill: ${ACCENT};
      }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#topScrim)"/>
  <rect width="${W}" height="${H}" fill="url(#bottomScrim)"/>
  ${brandSvg}
  ${eyebrowSvg}
  ${ruleSvg}
  ${headlineSvg}
  ${discountSvg}
  ${dateSvg}
  ${ctaSvg}
</svg>`;

  return Buffer.from(svg);
}

// N2: Educational overlay — editorial poster, no card panel.
//
// Layout:
//   1. Eyebrow ("TIPS & ADVICE") in warm-cream accent, all-caps, letter-spaced
//   2. Serif headline (Cormorant Garamond) wrapped over up to 3 lines
//   3. Hairline accent rule under the headline
//   4. Tips column — type sits directly on the photograph with a subtle
//      drop-shadow for legibility; a thin vertical hairline runs along the
//      indent column so the eye reads it as an editorial sidebar, not a
//      panel. Each tip uses a small italic-serif numeral and a sans-serif
//      body line, lighter weight than the headline.
//   5. Brand watermark anchored bottom-left with a small accent dot.
//
// Why no card panel: a dark rounded-rect over a soft spa photograph reads
// like a lecture slide. Premium editorial covers (Kinfolk, Cereal, etc.)
// place type on the image itself; legibility comes from a graded scrim and
// a feathered text shadow, not from a contrasting box.
async function renderEducationalOverlaySvg(input: EducationalOverlayInput) {
  const fontStyles = await getEmbeddedFontStyles();
  const businessName = clampWords(input.businessName, FIELD_LIMITS.businessName);
  const headlineFull = clampWords(input.headline, FIELD_LIMITS.headline);
  const headlineLines = wrapForOverlay(
    headlineFull,
    HEADLINE_MAX_CHARS_PER_LINE,
    HEADLINE_MAX_LINES,
  );

  // ── Vertical layout (1024×1536 portrait) ─────────────────────────────────
  const eyebrowY = PAD + 56; // top of the editorial label
  const headlineTopY = eyebrowY + 86;
  const headlineLineHeight = 92;

  const headlineSvg = headlineLines
    .map((line, index) => {
      const y = headlineTopY + index * headlineLineHeight;
      const estimatedWidth =
        line.length * HEADLINE_FONT_SIZE * HEADLINE_AVG_CHAR_WIDTH_FACTOR;
      const fitAttrs =
        estimatedWidth > HEADLINE_MAX_WIDTH
          ? ` textLength="${HEADLINE_MAX_WIDTH}" lengthAdjust="spacingAndGlyphs"`
          : "";
      return `<text x="${PAD}" y="${y}" class="headline"${fitAttrs}>${escapeXml(line)}</text>`;
    })
    .join("");

  const headlineBottomY =
    headlineTopY + (headlineLines.length - 1) * headlineLineHeight;

  // Hairline accent rule under headline (signature editorial gesture).
  const ruleY = headlineBottomY + 38;
  const ruleSvg = `<line x1="${PAD}" y1="${ruleY}" x2="${PAD + 76}" y2="${ruleY}" stroke="${ACCENT}" stroke-width="1.5" stroke-linecap="square" />`;

  // Tips: pre-wrap each tip block.
  const tipsRaw = (input.tips ?? []).slice(0, TIP_MAX_COUNT);
  const tipBlocks = tipsRaw
    .map((tipText) => {
      const cleaned = tipText.trim();
      if (!cleaned) return null;
      const wrapped = wrapForOverlay(
        cleaned,
        TIP_MAX_CHARS_PER_LINE,
        TIP_MAX_LINES_PER_TIP,
      );
      return wrapped.length > 0 ? wrapped : null;
    })
    .filter((value): value is string[] => value !== null);

  // No card panel — type sits on the photograph with a feathered scrim and
  // a drop-shadow filter applied to the text classes for legibility.
  let indentRuleSvg = "";
  let tipsSvg = "";
  if (tipBlocks.length > 0) {
    const tipsTopY = ruleY + 56;
    const tipsAreaHeight =
      tipBlocks.reduce((sum, lines) => sum + lines.length * TIP_LINE_HEIGHT, 0) +
      Math.max(0, tipBlocks.length - 1) * TIP_INTER_GAP;

    // Hairline vertical rule along the indent column — quiet editorial cue.
    const indentRuleX = PAD + 18;
    indentRuleSvg = `<line x1="${indentRuleX}" y1="${tipsTopY - 8}" x2="${indentRuleX}" y2="${tipsTopY + tipsAreaHeight + 8}" stroke="${ACCENT}" stroke-opacity="0.55" stroke-width="1" />`;

    let cursorY = tipsTopY + TIP_FONT_SIZE; // baseline of first tip line
    const tipPieces: string[] = [];
    tipBlocks.forEach((lines, tipIdx) => {
      const numeral = String(tipIdx + 1).padStart(2, "0");
      const numeralX = PAD + 30; // small offset right of the indent rule
      const textX = PAD + TIP_TEXT_INDENT;
      tipPieces.push(
        `<text x="${numeralX}" y="${cursorY}" class="tip-numeral">${numeral}</text>`,
      );
      lines.forEach((line, lineIdx) => {
        const y = cursorY + lineIdx * TIP_LINE_HEIGHT;
        const estimatedWidth =
          line.length * TIP_FONT_SIZE * TIP_AVG_CHAR_WIDTH_FACTOR;
        const fitAttrs =
          estimatedWidth > TIP_MAX_WIDTH
            ? ` textLength="${TIP_MAX_WIDTH}" lengthAdjust="spacingAndGlyphs"`
            : "";
        tipPieces.push(
          `<text x="${textX}" y="${y}" class="tip"${fitAttrs}>${escapeXml(line)}</text>`,
        );
      });
      cursorY += lines.length * TIP_LINE_HEIGHT + TIP_INTER_GAP;
    });
    tipsSvg = tipPieces.join("");
  }

  // Brand watermark — bottom-left, smaller, with an accent dot for tone.
  const watermarkY = H - PAD - 8;
  const brandDotX = PAD;
  const brandTextX = PAD + 18;
  const brandSvg = `
    <circle cx="${brandDotX + 2}" cy="${watermarkY - 8}" r="3" fill="${ACCENT}" />
    <text x="${brandTextX}" y="${watermarkY}" class="brand">${escapeXml(businessName.toUpperCase())}</text>
  `;

  // Eyebrow ("TIPS & ADVICE") sits above the headline.
  const eyebrowSvg = `<text x="${PAD}" y="${eyebrowY}" class="eyebrow">TIPS &amp; ADVICE</text>`;

  // Custom font + element rules layered on top of the base styles. All text
  // classes get a feathered shadow filter so type stays legible without a
  // dark panel — the trick that print covers use to set headlines directly
  // on photography.
  const educationalFontStyles =
    fontStyles.replace(
      /\.brand\s*\{[^}]*font-size:\s*[\d.]+px/,
      ".brand { font-family: 'DM Sans',Arial,sans-serif; font-weight: 600; font-size: 22px; letter-spacing: 0.24em; fill: rgba(255,255,255,0.92)",
    ) +
    `
.eyebrow {
  font-family: 'DM Sans', Arial, sans-serif;
  font-weight: 600;
  font-size: 20px;
  letter-spacing: 0.36em;
  fill: ${ACCENT};
  filter: url(#textShadow);
}
.headline { filter: url(#textShadow); }
.tip {
  font-family: 'DM Sans', Arial, sans-serif;
  font-weight: 400;
  font-size: ${TIP_FONT_SIZE}px;
  fill: #f5efe5;
  letter-spacing: 0.15px;
  filter: url(#textShadow);
}
.tip-numeral {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-style: italic;
  font-weight: 600;
  font-size: ${TIP_NUMERAL_FONT_SIZE}px;
  fill: ${ACCENT};
  letter-spacing: 0.02em;
  filter: url(#textShadow);
}
.brand { filter: url(#textShadow); }
`;

  // Long, soft top scrim that fades naturally into the photo — replaces the
  // hard "darkened upper third" look. Reaches past the headline area so tips
  // get gentle support too.
  const scrimEndY = H * 0.55;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
      <feOffset dx="0" dy="2" result="offset" />
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.65" />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="${scrimEndY}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgb(8,12,16)" stop-opacity="0.62"/>
      <stop offset="0.55" stop-color="rgb(8,12,16)" stop-opacity="0.32"/>
      <stop offset="1" stop-color="rgb(8,12,16)" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottomScrim" x1="0" y1="${H - PAD * 1.8}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgb(8,12,16)" stop-opacity="0"/>
      <stop offset="1" stop-color="rgb(8,12,16)" stop-opacity="0.55"/>
    </linearGradient>
    <style>
      ${educationalFontStyles}
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#topScrim)"/>
  <rect width="${W}" height="${H}" fill="url(#bottomScrim)"/>
  ${eyebrowSvg}
  ${headlineSvg}
  ${ruleSvg}
  ${indentRuleSvg}
  ${tipsSvg}
  ${brandSvg}
</svg>`;

  return Buffer.from(svg);
}

async function renderWatermarkSvg(input: OrganicOverlayInput) {
  const businessName = clampWords(input.businessName, FIELD_LIMITS.businessName);
  const fontStyles = await getEmbeddedFontStyles();

  // Watermark uses a smaller brand font size — override just the size here.
  const watermarkFontStyles = fontStyles.replace(
    /\.brand\s*\{[^}]*font-size:\s*[\d.]+px/,
    ".brand { font-family: 'DM Sans',Arial,sans-serif; font-weight: 500; font-size: 22px",
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="120" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgb(8,12,16)" stop-opacity="0.32"/>
      <stop offset="1" stop-color="rgb(8,12,16)" stop-opacity="0"/>
    </linearGradient>
    <style>
      ${watermarkFontStyles}
    </style>
  </defs>
  <rect width="${W}" height="120" fill="url(#topScrim)"/>
  <text x="${PAD}" y="${PAD + 24}" class="brand">${escapeXml(businessName.toUpperCase())}</text>
</svg>`;

  return Buffer.from(svg);
}
