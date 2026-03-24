import { put } from "@vercel/blob";
import { DiscountType } from "@/prisma/generated/prisma/enums";
import { logger } from "@/lib/logger";
import {
  generateGeminiImage,
  isGeminiConfigured,
} from "@/lib/services/social/gemini-client";
import {
  generateOpenAIImage,
  isOpenAIImageConfigured,
} from "@/lib/services/social/openai-image-client";
import {
  DEFAULT_SOCIAL_IMAGE_PROFILE,
  type SocialImageProfile,
} from "@/lib/services/social/image-profiles";

type PromoImageInput = {
  businessSlug: string;
  businessName: string;
  title: string;
  saleDescription?: string | null;
  captionText?: string | null;
  discountType: DiscountType;
  discountValue: number;
  startDate: Date;
  endDate: Date;
  serviceNames?: string[];
  serviceCategories?: string[];
  packageNames?: string[];
  imageProfile?: SocialImageProfile;
  actionCategory?: string;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDiscount(discountType: DiscountType, discountValue: number) {
  if (discountType === "PERCENTAGE") {
    return `${discountValue}% OFF`;
  }
  return `PHP ${discountValue.toFixed(0)} OFF`;
}

function formatDates(startDate: Date, endDate: Date) {
  const formatter = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function pickRandom<T>(items: readonly T[]) {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function sanitizeCaptionLine(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function extractCaptionSignals(captionText?: string | null) {
  if (!captionText?.trim()) {
    return {
      hookLine: "No existing caption hook provided.",
      supportingLines: [] as string[],
      keywords: [] as string[],
    };
  }

  const lines = captionText
    .split("\n")
    .map((line) => sanitizeCaptionLine(line))
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .filter((line) => !/^www\.serviceflow/i.test(line))
    .slice(0, 8);

  const hookLine = lines[0] || "No existing caption hook provided.";
  const supportingLines = lines.slice(1, 3);
  const keywords = Array.from(
    new Set(
      lines
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 5)
        .slice(0, 10),
    ),
  );

  return {
    hookLine,
    supportingLines,
    keywords,
  };
}

function dedupeCategories(values?: string[]) {
  if (!values?.length) return [];
  return Array.from(
    new Set(values.map((value) => value.trim().replace(/\s+/g, " ")).filter(Boolean)),
  ).slice(0, 6);
}

function inferSeasonThemeFromTitle(input: PromoImageInput) {
  const title = input.title.toLowerCase();
  const dateWindow = formatDates(input.startDate, input.endDate);

  if (/(valentine|date|love month|couple|heart)/i.test(title)) {
    return "Valentine season mood: romantic, blush tones, self-love and pair-friendly vibe.";
  }
  if (/(summer|tag-init|beach|sun|heat)/i.test(title)) {
    return "Summer season mood: fresh, bright, airy, glow-up energy.";
  }
  if (/(christmas|xmas|holiday|new year|ber)/i.test(title)) {
    return "Holiday season mood: celebratory, premium giftable, polished finish.";
  }
  if (/(rainy|tag-ulan|ulan|monsoon)/i.test(title)) {
    return "Rainy season mood: cozy, comforting, stress-relief treatment atmosphere.";
  }
  if (/(holy week|easter|lenten|lent)/i.test(title)) {
    return "Holy Week mood: calm, reflective, restorative wellness focus.";
  }
  return `General campaign mood from title "${input.title}" scheduled ${dateWindow}.`;
}

type ProfileBlueprint = {
  baselineDirection: string;
  subjects: readonly string[];
  compositions: readonly string[];
  typography: readonly string[];
  palette: readonly string[];
  texture: readonly string[];
  camera: readonly string[];
};

const PROFILE_BLUEPRINTS: Record<SocialImageProfile, ProfileBlueprint> = {
  PHOTO_REALISTIC: {
    baselineDirection:
      "Use believable human subjects and real-world spa/salon context. Avoid template look.",
    subjects: [
      "close-up of client receiving treatment with natural expression",
      "therapist-client interaction in clean wellness room",
      "beauty treatment moment with subtle candid energy",
      "lifestyle portrait after treatment with confident smile",
    ],
    compositions: [
      "portrait-first composition with centered subject and balanced top/bottom breathing room",
      "centered portrait with readable text lockup inside safe margins",
      "diagonal depth composition while keeping key subject in center frame",
      "single hero composition with clean negative space in one top corner for manual logo",
    ],
    typography: [
      "clean sans serif, medium-bold headline, minimal secondary text",
      "editorial sans headline with compact uppercase subheads",
      "friendly geometric sans with high readability spacing",
    ],
    palette: [
      "neutral whites with warm beige accents",
      "fresh mint and cream palette",
      "soft blush plus natural skin-tone harmony",
    ],
    texture: [
      "subtle film grain and soft lens bloom",
      "clean high-clarity finish with gentle shadows",
      "natural light texture with shallow depth of field",
    ],
    camera: [
      "35mm lifestyle framing",
      "50mm portrait framing",
      "slight top-down editorial angle",
    ],
  },
  SOFT_EDITORIAL: {
    baselineDirection:
      "Design-forward spa editorial look with premium whitespace and refined hierarchy.",
    subjects: [
      "beauty ritual close-up with elegant hand gestures",
      "calm spa treatment table with styled props",
      "minimal portrait with soft facial glow",
      "self-care still life with flowers and towels",
    ],
    compositions: [
      "large whitespace margins with centered hero image in portrait framing",
      "clean editorial portrait layout with centered headline lockup",
      "asymmetric editorial modules while preserving centered focal content",
      "refined portrait system with one quiet top-corner logo-safe zone",
    ],
    typography: [
      "elegant serif headline with modern sans body",
      "high-contrast serif title and restrained sans captions",
      "refined mixed typography with premium spacing",
    ],
    palette: [
      "off-white, champagne, and dusty rose",
      "warm ivory with muted peach accents",
      "soft taupe and cream with light gold highlights",
    ],
    texture: [
      "paper-like matte texture",
      "subtle watercolor wash background",
      "frosted translucent overlay panels",
    ],
    camera: [
      "soft diffusion portrait",
      "editorial close crop",
      "balanced straight-on composition",
    ],
  },
  MODERN_GRAPHIC: {
    baselineDirection:
      "Graphic social-card treatment with bold shapes, clear hierarchy, and campaign energy.",
    subjects: [
      "single hero portrait cutout with graphic frame",
      "service close-up inside geometric clipping mask",
      "multi-panel collage of treatments and outcomes",
      "dynamic before-relaxation style storytelling frame",
    ],
    compositions: [
      "portrait modular layout with centered headline and dominant hero tile",
      "layered geometric blocks that frame a centered subject",
      "grid with one dominant center tile and calmer edge details",
      "high-contrast portrait card with text and focal image aligned to center axis",
    ],
    typography: [
      "bold sans headline with compact promo labels",
      "all-caps modern headline with strong weight contrast",
      "stacked typographic hierarchy for social feed readability",
    ],
    palette: [
      "high-contrast cream, charcoal, and accent gold",
      "clean white with coral and deep teal accents",
      "muted beige with black and warm orange accents",
    ],
    texture: [
      "flat vector-like overlays with subtle shadows",
      "paper cutout layers and modern gradients",
      "minimal dotted patterns and abstract shapes",
    ],
    camera: [
      "front-facing promo-card framing",
      "slight perspective tilt for movement",
      "mixed crop scales for dynamic energy",
    ],
  },
  BOLD_MONOCHROME: {
    baselineDirection:
      "Dark dramatic monochrome style with premium contrast and strong focal point.",
    subjects: [
      "high-contrast portrait with directional light",
      "treatment action shot in moody monochrome",
      "close-up details with dramatic shadows",
      "cinematic salon scene with confident subject",
    ],
    compositions: [
      "dominant centered hero visual with strong text band",
      "minimal black-white portrait layout with centered hierarchy",
      "centered dramatic portrait with bold headline lockup",
      "moody framing that keeps face and key text centered and legible",
    ],
    typography: [
      "bold condensed sans uppercase headline",
      "heavy serif headline with modern sans support text",
      "high-impact typographic contrast and tight rhythm",
    ],
    palette: [
      "deep black, charcoal, and warm gray",
      "graphite monochrome with muted gold accent",
      "black-and-white base with subtle cream highlights",
    ],
    texture: [
      "cinematic grain and vignetting",
      "high contrast matte shadows",
      "monochrome depth with soft smoke-like gradient",
    ],
    camera: [
      "dramatic side light portrait angle",
      "tight cinematic crop",
      "low-key frontal framing",
    ],
  },
};

function buildPromoSvg(input: PromoImageInput) {
  const title = escapeXml(input.title);
  const businessName = escapeXml(input.businessName);
  const discount = escapeXml(
    formatDiscount(input.discountType, input.discountValue),
  );
  const dates = escapeXml(formatDates(input.startDate, input.endDate));

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#064e3b" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="60" y="60" width="1080" height="510" rx="36" fill="rgba(255,255,255,0.12)" />
  <text x="100" y="150" font-size="44" font-weight="700" fill="#ecfdf5" font-family="Arial, sans-serif">${businessName}</text>
  <text x="100" y="260" font-size="64" font-weight="800" fill="#ffffff" font-family="Arial, sans-serif">${discount}</text>
  <text x="100" y="340" font-size="52" font-weight="700" fill="#d1fae5" font-family="Arial, sans-serif">${title}</text>
  <text x="100" y="430" font-size="36" font-weight="500" fill="#ecfdf5" font-family="Arial, sans-serif">${dates}</text>
  <text x="100" y="520" font-size="30" font-weight="500" fill="#ecfdf5" font-family="Arial, sans-serif">Book now on ServiceFlow</text>
</svg>`;
}

export function buildSocialImagePrompt(input: PromoImageInput) {
  const services = input.serviceNames?.filter(Boolean) ?? [];
  const categories = dedupeCategories(input.serviceCategories);
  const packages = input.packageNames?.filter(Boolean) ?? [];
  const imageProfile = input.imageProfile || DEFAULT_SOCIAL_IMAGE_PROFILE;
  const blueprint = PROFILE_BLUEPRINTS[imageProfile];
  const captionSignals = extractCaptionSignals(input.captionText);
  const seasonTheme = inferSeasonThemeFromTitle(input);
  const variationSeed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000)}`;

  const serviceLine =
    services.length > 0
      ? `Relevant services: ${services.slice(0, 6).join(", ")}`
      : "Relevant services: none provided";
  const packageLine =
    packages.length > 0
      ? `Relevant packages: ${packages.slice(0, 6).join(", ")}`
      : "Relevant packages: none provided";
  const categoryLine =
    categories.length > 0
      ? `Service categories (selected): ${categories.join(", ")}`
      : "Service categories (selected): none provided";
  const supportingCaptionLine = captionSignals.supportingLines[0] || "No supporting caption line.";
  const captionKeywords =
    captionSignals.keywords.length > 0
      ? captionSignals.keywords.join(", ")
      : "none";

  return [
    "Create a high-quality and visually distinct social media promo visual for a beauty/wellness business.",
    "The output must be portrait and feed-ready (roughly 1024x1536 composition) for Facebook and Instagram.",
    "Keep the key subject and critical campaign text centered with safe margins to avoid awkward cropping.",
    "Do not let important text or the hero subject drift off-center or near cut-off edges.",
    "If a person appears, prefer a modern Filipina look with authentic Filipino features and contemporary styling.",
    "Primary campaign context source is the SALE TITLE. Use title theme first, then caption details.",
    "Do not produce a generic template look. Make this composition feel unique and campaign-specific.",
    `Design profile: ${imageProfile}.`,
    `Profile baseline direction: ${blueprint.baselineDirection}`,
    `Season/occasion cue from title: ${seasonTheme}`,
    `Variation seed: ${variationSeed}`,
    `Primary subject direction: ${pickRandom(blueprint.subjects)}`,
    `Composition direction: ${pickRandom(blueprint.compositions)}`,
    `Typography direction: ${pickRandom(blueprint.typography)}`,
    `Color palette direction: ${pickRandom(blueprint.palette)}`,
    `Texture direction: ${pickRandom(blueprint.texture)}`,
    `Camera/framing direction: ${pickRandom(blueprint.camera)}`,
    `Caption hook to visually support: ${captionSignals.hookLine}`,
    `Caption supporting line: ${supportingCaptionLine}`,
    `Caption keywords to echo in visual mood: ${captionKeywords}`,
    "Use polished visuals, coherent typography, and readable hierarchy.",
    "Keep text concise and centered. Avoid gibberish words, random logos, and fake brands.",
    "Include these key text elements in the design:",
    `- ${input.businessName}`,
    `- ${formatDiscount(input.discountType, input.discountValue)}`,
    `- ${input.title}`,
    `- ${input.saleDescription?.trim() || "Limited-time offer"}`,
    `- ${formatDates(input.startDate, input.endDate)}`,
    "- Book now on ServiceFlow",
    serviceLine,
    categoryLine,
    packageLine,
    "Hard constraints:",
    "- Do not generate business logos. Leave one clean top corner for manual logo overlay.",
    "- No external logos, no watermarks, no trademarked brand marks.",
    "- No repeated text blocks, no spelling errors, no malformed letters.",
    "- Maintain premium beauty/wellness mood aligned to the chosen profile.",
  ].join("\n");
}

function mimeTypeToExtension(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "png";
}

export async function generateAndUploadPromoImage(input: PromoImageInput) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return null;
  }

  if (isOpenAIImageConfigured()) {
    try {
      const image = await generateOpenAIImage({
        prompt: buildSocialImagePrompt(input),
      });
      const extension = mimeTypeToExtension(image.mimeType);
      const fileName = `social-promo-${input.businessSlug}-${Date.now()}.${extension}`;
      const blob = await put(fileName, image.bytes, {
        access: "public",
        addRandomSuffix: true,
        contentType: image.mimeType,
      });
      return blob.url;
    } catch (error) {
      logger.warn("[Social] OpenAI image generation failed. Trying fallback.", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (isGeminiConfigured()) {
    try {
      const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
      const image = await generateGeminiImage({
        model,
        prompt: buildSocialImagePrompt(input),
      });
      const extension = mimeTypeToExtension(image.mimeType);
      const fileName = `social-promo-${input.businessSlug}-${Date.now()}.${extension}`;
      const blob = await put(fileName, image.bytes, {
        access: "public",
        addRandomSuffix: true,
        contentType: image.mimeType,
      });
      return blob.url;
    } catch (error) {
      logger.warn("[Social] Gemini image generation failed. Using SVG fallback.", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const svg = buildPromoSvg(input);
  const fileName = `social-promo-${input.businessSlug}-${Date.now()}.svg`;
  const blob = await put(fileName, svg, {
    access: "public",
    addRandomSuffix: true,
    contentType: "image/svg+xml",
  });

  return blob.url;
}
