import sharp from "sharp";

import { logger } from "@/lib/logger";
import { DiscountType } from "@/prisma/generated/prisma/enums";
import { getEmbeddedFontStyles } from "@/lib/services/social/font-loader";

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

// Wave K2: bullet rendering constants. Sans-serif (DM Sans) at smaller
// size so several bullets fit in the upper-half whitespace without
// crowding the photograph that anchors the lower portion of the frame.
const TIP_FONT_SIZE = 38;
const TIP_AVG_CHAR_WIDTH_FACTOR = 0.5; // sans-serif is narrower than the serif headline
const TIP_LINE_HEIGHT = 56;
const TIP_MAX_CHARS_PER_LINE = 38;
const TIP_MAX_LINES_PER_TIP = 2;
const TIP_MAX_COUNT = 3;
const TIP_MAX_WIDTH = W - PAD * 2;
const TIP_BULLET_GLYPH = "•";

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
    const overlay = await renderSaleOverlaySvg(input);
    const bytes = await sharp(background)
      .resize(W, H, { fit: "cover", position: "centre" })
      .composite([{ input: overlay, top: 0, left: 0 }])
      .png({ quality: 92 })
      .toBuffer();
    return { bytes, mimeType: "image/png" };
  } catch (error) {
    logger.warn(
      "[Social] Promo overlay composition failed; returning raw background.",
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
    const overlay = await renderWatermarkSvg(input);
    const bytes = await sharp(background)
      .resize(W, H, { fit: "cover", position: "centre" })
      .composite([{ input: overlay, top: 0, left: 0 }])
      .png({ quality: 92 })
      .toBuffer();
    return { bytes, mimeType: "image/png" };
  } catch (error) {
    logger.warn(
      "[Social] Watermark composition failed; returning raw background.",
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
    const overlay = await renderEducationalOverlaySvg(input);
    const bytes = await sharp(background)
      .resize(W, H, { fit: "cover", position: "centre" })
      .composite([{ input: overlay, top: 0, left: 0 }])
      .png({ quality: 92 })
      .toBuffer();
    return { bytes, mimeType: "image/png" };
  } catch (error) {
    logger.warn(
      "[Social] Educational overlay composition failed; returning raw background.",
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
      // Only force textLength when the line would overflow — preserves
      // natural letter spacing for short titles, gracefully squishes long ones.
      // lengthAdjust="spacingAndGlyphs" scales both inter-letter spacing and
      // the glyphs themselves, which is more graceful than per-letter scaling.
      const fitAttrs =
        estimatedWidth > HEADLINE_MAX_WIDTH
          ? ` textLength="${HEADLINE_MAX_WIDTH}" lengthAdjust="spacingAndGlyphs"`
          : "";
      return `<text x="${PAD}" y="${y}" class="headline"${fitAttrs}>${escapeXml(line)}</text>`;
    })
    .join("");

  const discountSvg = discountLabel
    ? `<text x="${PAD}" y="${H - PAD - 130}" class="discount">${escapeXml(discountLabel)}</text>`
    : "";

  const dateY = discountLabel ? H - PAD - 70 : H - PAD - 100;
  const dateSvg = `<text x="${PAD}" y="${dateY}" class="date">${escapeXml(dateLabel)}</text>`;

  const ctaSvg = `<text x="${W - PAD}" y="${H - PAD}" class="cta" text-anchor="end">→  serviceflow.store</text>`;

  const brandSvg = `<text x="${PAD}" y="${PAD + 28}" class="brand">${escapeXml(businessName.toUpperCase())}</text>`;

  // Bottom gradient scrim — strengthened from the original 0.78 → 0.88 max
  // opacity and pulled up from 0.4×H → 0.5×H so headline contrast holds even
  // on light backgrounds (cream towels, beige spa scenes, sunlit photos).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bottomScrim" x1="0" y1="${H * 0.5}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgb(8,12,16)" stop-opacity="0"/>
      <stop offset="0.5" stop-color="rgb(8,12,16)" stop-opacity="0.55"/>
      <stop offset="1" stop-color="rgb(8,12,16)" stop-opacity="0.88"/>
    </linearGradient>
    <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="${PAD * 2.2}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgb(8,12,16)" stop-opacity="0.40"/>
      <stop offset="1" stop-color="rgb(8,12,16)" stop-opacity="0"/>
    </linearGradient>
    <style>
      ${fontStyles}
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#topScrim)"/>
  <rect width="${W}" height="${H}" fill="url(#bottomScrim)"/>
  ${brandSvg}
  ${headlineSvg}
  ${discountSvg}
  ${dateSvg}
  ${ctaSvg}
</svg>`;

  return Buffer.from(svg);
}

async function renderEducationalOverlaySvg(input: EducationalOverlayInput) {
  const fontStyles = await getEmbeddedFontStyles();
  const businessName = clampWords(input.businessName, FIELD_LIMITS.businessName);
  const headlineFull = clampWords(input.headline, FIELD_LIMITS.headline);
  const headlineLines = wrapForOverlay(
    headlineFull,
    HEADLINE_MAX_CHARS_PER_LINE,
    HEADLINE_MAX_LINES,
  );

  // Anchor headline in upper third of frame, lines stacked downward.
  const headlineLineHeight = 92;
  const headlineTopY = PAD + 120;
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

  // Wave K2: bullet tips below the headline. Each tip wraps across up to
  // TIP_MAX_LINES_PER_TIP lines (sans-serif, smaller font). We compute
  // total height up front so the layout never spills past the upper-half
  // negative-space band the EDUCATIONAL blueprint reserves.
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

  const headlineBottomY =
    headlineTopY + (headlineLines.length - 1) * headlineLineHeight;
  const tipsTopY = headlineBottomY + 72; // breathing room beneath headline
  let tipsCursor = tipsTopY;
  const tipSvgPieces: string[] = [];
  for (const lines of tipBlocks) {
    lines.forEach((line, lineIdx) => {
      const y = tipsCursor + lineIdx * TIP_LINE_HEIGHT;
      const estimatedWidth =
        line.length * TIP_FONT_SIZE * TIP_AVG_CHAR_WIDTH_FACTOR;
      const fitAttrs =
        estimatedWidth > TIP_MAX_WIDTH
          ? ` textLength="${TIP_MAX_WIDTH}" lengthAdjust="spacingAndGlyphs"`
          : "";
      const prefix = lineIdx === 0 ? `${TIP_BULLET_GLYPH}  ` : "    ";
      tipSvgPieces.push(
        `<text x="${PAD}" y="${y}" class="tip"${fitAttrs}>${escapeXml(prefix + line)}</text>`,
      );
    });
    tipsCursor += lines.length * TIP_LINE_HEIGHT + 14; // small inter-tip gap
  }
  const tipsSvg = tipSvgPieces.join("");

  // Top scrim ensures headline+tips contrast against any background.
  // Bottom remains mostly clean photograph; a single small watermark
  // sits bottom-left, mirroring the sale promo's brand placement.
  const watermarkY = H - PAD;
  const brandSvg = `<text x="${PAD}" y="${watermarkY}" class="brand">${escapeXml(businessName.toUpperCase())}</text>`;

  // Smaller brand size for educational watermark + dedicated `.tip` rule
  // (DM Sans, slightly translucent so the bullets feel like supporting
  // copy rather than competing with the serif headline).
  const educationalFontStyles =
    fontStyles.replace(
      /\.brand\s*\{[^}]*font-size:\s*[\d.]+px/,
      ".brand { font-family: 'DM Sans',Arial,sans-serif; font-weight: 500; font-size: 22px",
    ) +
    `
.tip {
  font-family: 'DM Sans', Arial, sans-serif;
  font-weight: 500;
  font-size: ${TIP_FONT_SIZE}px;
  fill: #f8f8f4;
  letter-spacing: 0.2px;
}
`;

  // The scrim now extends a bit further down so the bullet area is
  // legible. Stop at 0.6 × H so the lower 40% of the frame is still
  // a clean unobstructed photograph for the flat-lay subject.
  const scrimEndY = tipBlocks.length > 0 ? H * 0.6 : H * 0.45;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="${scrimEndY}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgb(8,12,16)" stop-opacity="0.65"/>
      <stop offset="0.7" stop-color="rgb(8,12,16)" stop-opacity="0.35"/>
      <stop offset="1" stop-color="rgb(8,12,16)" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottomScrim" x1="0" y1="${H - PAD * 1.6}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgb(8,12,16)" stop-opacity="0"/>
      <stop offset="1" stop-color="rgb(8,12,16)" stop-opacity="0.4"/>
    </linearGradient>
    <style>
      ${educationalFontStyles}
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#topScrim)"/>
  <rect width="${W}" height="${H}" fill="url(#bottomScrim)"/>
  ${headlineSvg}
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
