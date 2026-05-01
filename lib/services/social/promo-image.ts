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
import type { OrganicPostCategory } from "@/lib/services/social/caption-generator";
import {
  composeBusinessNameWatermark,
  composeSalePromoOverlay,
} from "@/lib/services/social/image-text-composer";

// ─── Public types ───────────────────────────────────────────────────────────

export type PromoImageInput = {
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
  ownerImageDirection?: string;
  actionCategory?: string;
};

export type OrganicImageInput = {
  businessSlug: string;
  businessName: string;
  topic: string;
  category: OrganicPostCategory;
  captionText?: string | null;
  imageProfile?: SocialImageProfile;
  visualMood?: string;
  visualFocus?: string;
  ownerDirection?: string;
  /**
   * When true, the business name is composed onto the photograph as a small
   * top-left watermark. Defaults to false — owners can opt in.
   */
  imprintBusinessName?: boolean;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function pickRandom<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index] as T;
}

function dedupeStrings(values?: readonly string[]) {
  if (!values?.length) return [] as string[];
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

function sanitizeCaptionLine(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function extractCaptionHook(captionText?: string | null) {
  if (!captionText?.trim()) return null;
  const lines = captionText
    .split("\n")
    .map(sanitizeCaptionLine)
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .filter((line) => !/^www\.serviceflow/i.test(line));
  return lines[0] || null;
}

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateRange(startDate: Date, endDate: Date) {
  if (isSameCalendarDay(startDate, endDate)) {
    return "Flash sale — today only";
  }
  const formatter = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
}

function inferSeasonContext(title: string, dateRange: string) {
  const lower = title.toLowerCase();
  if (/(valentine|date night|love month|couple|heart)/i.test(lower)) {
    return "Valentine's mood — soft, romantic, blush and rose tones, intimate self-care energy.";
  }
  if (/(summer|tag-init|beach|sun|heat)/i.test(lower)) {
    return "Summer mood — fresh, sun-kissed, airy, glow-up energy with bright natural light.";
  }
  if (/(christmas|xmas|holiday|new year|ber month)/i.test(lower)) {
    return "Holiday mood — celebratory, premium giftable feeling, warm polished light.";
  }
  if (/(rainy|tag-ulan|ulan|monsoon)/i.test(lower)) {
    return "Rainy season mood — cozy, comforting, candle-warm, stress-relief atmosphere.";
  }
  if (/(holy week|easter|lenten|lent)/i.test(lower)) {
    return "Holy Week mood — calm, reflective, restorative wellness focus.";
  }
  return `General mood: campaign window ${dateRange}, "${title}".`;
}

function mimeTypeToExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

// ─── Profile blueprints ─────────────────────────────────────────────────────

type ProfileBlueprint = {
  baseline: string;
  subjects: readonly string[];
  compositions: readonly string[];
  palette: readonly string[];
  texture: readonly string[];
  camera: readonly string[];
  preferredDimensions: string;
};

const PROFILE_BLUEPRINTS: Record<SocialImageProfile, ProfileBlueprint> = {
  PHOTO_REALISTIC: {
    baseline:
      "Believable lifestyle photography in a real beauty/wellness setting. Avoid the AI-template look.",
    subjects: [
      "candid client portrait during a treatment, natural relaxed expression, soft window light — face and upper body only",
      "extreme close-up of a single person's hands applying product to their own skin, shallow depth of field — no other hands in frame",
      "post-treatment portrait — fresh, glowing skin, genuine relaxed smile",
      "lifestyle moment of a client checking themselves in a salon mirror, calm and content",
    ],
    compositions: [
      "centered subject with generous breathing room above and below",
      "rule-of-thirds composition with diagonal flow into the subject",
      "tight intimate crop on hands or face details",
      "wider environmental shot showing salon textures and warmth",
    ],
    palette: [
      "neutral whites with warm beige and natural skin tones",
      "fresh mint and cream with soft sage accents",
      "soft blush, ivory, and natural skin-tone harmony",
    ],
    texture: [
      "subtle film grain and gentle lens bloom",
      "clean clarity with soft window-light shadows",
      "natural diffused light with shallow depth of field",
    ],
    camera: [
      "Canon EOS R5, 35mm f/1.8, lifestyle framing",
      "Sony A7R IV, 50mm f/1.4, portrait framing",
      "85mm f/1.8, slight editorial top-down angle",
    ],
    preferredDimensions: "1024×1536 portrait, Instagram and Facebook feed safe",
  },
  SOFT_EDITORIAL: {
    baseline:
      "Premium spa editorial — refined whitespace, calm hierarchy, magazine-quality lighting.",
    subjects: [
      "elegant beauty ritual close-up with poised hand gestures",
      "calm spa treatment table styled with linen, ceramic, and dried botanicals",
      "minimal portrait with soft facial glow and considered styling",
      "self-care still life — flowers, towels, ceramic bowl, soft fabric",
    ],
    compositions: [
      "wide whitespace margins with a single hero subject",
      "centered editorial portrait with quiet supporting details",
      "asymmetric composition with one strong focal anchor",
      "still-life arrangement with one dominant element and breathing space",
    ],
    palette: [
      "off-white, champagne, and dusty rose",
      "warm ivory with muted peach accents",
      "soft taupe and cream with subtle gold highlights",
    ],
    texture: [
      "paper-soft matte finish",
      "subtle watercolor-like background wash",
      "frosted translucent quality, almost film-like",
    ],
    camera: [
      "soft diffusion portrait lens",
      "editorial close crop, 100mm",
      "balanced straight-on composition with gentle bokeh",
    ],
    preferredDimensions: "1024×1536 portrait, magazine-spread feel",
  },
  MODERN_GRAPHIC: {
    baseline:
      "Bold modern social-card aesthetic — strong shapes, clean focal hierarchy, campaign energy. The image itself stands without text.",
    subjects: [
      "single hero portrait with confident expression, framed by clean negative space",
      "service close-up against a single bold backdrop color",
      "stylized treatment-in-progress shot with intentional color blocking",
      "still-life of products arranged with graphic precision",
    ],
    compositions: [
      "centered subject on a single saturated backdrop with generous negative space",
      "off-center hero with one strong color block balancing the frame",
      "tight crop turning the subject into a graphic shape itself",
      "high-contrast portrait with clear directional lighting",
    ],
    palette: [
      "high-contrast cream, charcoal, and accent gold",
      "clean white with coral and deep teal accents",
      "muted beige with black and warm orange accents",
    ],
    texture: [
      "flat clean digital finish with crisp shadows",
      "subtle paper grain over saturated colors",
      "minimal noise, modern and sharp",
    ],
    camera: [
      "front-facing 50mm portrait, even studio softbox",
      "slight perspective tilt for movement, 35mm",
      "85mm tight crop with controlled studio shadow",
    ],
    preferredDimensions: "1024×1536 portrait, social feed punchy",
  },
  BOLD_MONOCHROME: {
    baseline:
      "Cinematic monochrome — premium contrast, dramatic directional light, single confident subject.",
    subjects: [
      "high-contrast portrait with sculpted directional light, neutral expression",
      "close-up of a single person's hands against skin texture in moody monochrome — no other hands in frame",
      "close-up of texture details (skin, fabric, hair) under directional light",
      "wider salon scene with confident subject in cinematic light",
    ],
    compositions: [
      "single dominant centered subject with deep shadow falloff",
      "minimalist black-and-white framing with a strong focal point",
      "moody side-lit portrait with the subject framed in shadow",
      "symmetrical, almost still composition with cinematic restraint",
    ],
    palette: [
      "deep black, charcoal, warm gray",
      "graphite monochrome with a single muted gold accent",
      "black-and-white base with subtle cream highlights",
    ],
    texture: [
      "cinematic grain and gentle vignetting",
      "high-contrast matte shadows, smoke-like gradients",
      "monochrome depth with controlled highlight rolloff",
    ],
    camera: [
      "85mm f/1.4, dramatic side-light portrait",
      "50mm cinematic close crop, controlled shadow",
      "low-key frontal framing, 35mm with hard key light",
    ],
    preferredDimensions: "1024×1536 portrait, cinematic feel",
  },
  WARM_EDITORIAL: {
    baseline:
      "Warm amber-cream editorial — golden-hour skin, intimate fragments (face, shoulder, lips, products), dewy luminous quality. Think Vogue Philippines beauty editorial.",
    subjects: [
      "extreme close-up of dewy skin — cheek and jawline only — caramel sidelight, visible natural pore texture",
      "amber glass dropper bottle held in front of a softly blurred face, bottle in sharp focus",
      "lips and lower face — chin to nose — warm honey light, dewy skin, intimate editorial crop",
      "shoulder and collarbone with golden rim light, no face needed",
      "hands gently touching cheek with serum visible on skin, warm caramel skin tone",
      "amber bottle and white tube on warm cream linen, top-down macro",
      "skin texture macro — moisture beads, soft surface — golden sidelight",
      "eyes and brow only, calm downward gaze, warm rim glow",
    ],
    compositions: [
      "subject fills 85–95% of the frame, tight intimate crop",
      "product centered with warm gradient bokeh background",
      "fragmentary editorial framing — subject bleeds past frame edges",
      "slight rotation for dynamism, lower-third stays calm and luminous",
    ],
    palette: [
      "warm cream and honey gold — airy version, golden skin against cream",
      "rich caramel and deep amber — bronzed editorial tone",
      "off-white with golden tan highlights — almost overexposed warmth",
    ],
    texture: [
      "warm LUT — amber into highlights, sepia-brown into shadows, no cool tones",
      "golden hour grade — luminous caramel skin, deep warm shadows",
      "soft warm diffusion with subtle film grain — analog feel",
    ],
    camera: [
      "85mm f/1.4 — extreme shallow DOF, warm cream bokeh",
      "100mm macro f/2.8 — texture study, warm studio sidelight",
      "50mm f/1.8 — ambient warm context, golden hour or candlelit",
    ],
    preferredDimensions: "1024×1536 portrait, beauty-editorial intimate",
  },
};

// ─── Prompt building ────────────────────────────────────────────────────────

function buildPhotographyPrompt(input: {
  imageProfile: SocialImageProfile;
  variant: "promo" | "organic";
  businessName: string;
  contextLine: string;
  seasonLine: string;
  serviceContext: string | null;
  hookContext: string | null;
  visualMood: string | null;
  visualFocus: string | null;
  ownerDirection: string | null;
  subjectOverride?: string;
}): string {
  const profile = input.imageProfile;
  const blueprint = PROFILE_BLUEPRINTS[profile];
  const variationSeed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000)}`;
  const subjectDirection = input.subjectOverride || pickRandom(blueprint.subjects);

  const lines: Array<string | null> = [
    "You are a professional editorial photographer creating a single beautiful lifestyle photograph for a Filipino beauty and wellness brand's social media feed.",
    "Reference benchmark: Vogue Philippines beauty editorial, Marie Claire spa feature, Harper's Bazaar wellness story.",
    "",
    "THIS IS A PHOTOGRAPH — NEVER A GRAPHIC DESIGN OR POSTER.",
    "Do NOT embed any text, words, letters, numbers, dates, prices, discount badges, watermarks, or call-to-action copy in the image.",
    "Do NOT include logos, business names, or brand marks of any kind.",
    "All text and branding will live in the post caption — the image is pure photography.",
    "",
    `DESIGN PROFILE: ${profile}`,
    `Profile direction: ${blueprint.baseline}`,
    `Variation seed: ${variationSeed}`,
    `Output format: ${blueprint.preferredDimensions}.`,
    "",
    "CONTEXT (do not embed in the image — use only as creative direction):",
    input.contextLine,
    `Season / occasion: ${input.seasonLine}`,
    input.serviceContext ? `Featured services: ${input.serviceContext}.` : null,
    input.hookContext ? `Emotional tone from caption: "${input.hookContext}"` : null,
    input.visualMood ? `Requested mood: ${input.visualMood}.` : null,
    input.visualFocus ? `Visual focus: ${input.visualFocus}.` : null,
    "",
    "SUBJECT:",
    subjectDirection,
    "",
    "PHOTOGRAPHIC DIRECTION:",
    `Camera and framing: ${pickRandom(blueprint.camera)}.`,
    `Color palette: ${pickRandom(blueprint.palette)}.`,
    `Composition: ${pickRandom(blueprint.compositions)}.`,
    `Texture and finish: ${pickRandom(blueprint.texture)}.`,
    "Natural diffused light — soft window light or studio softbox. No harsh flash, no flat ring-light look.",
    "If a person appears: authentic Filipino features, natural skin texture with real imperfections, genuine candid expression — never a stock-photo pose, never an AI-plastic glow.",
    "Shallow depth of field where appropriate; gentle natural bokeh, not CGI-smooth backgrounds.",
    "",
    "HARD CONSTRAINTS:",
    "- Absolutely NO text, letters, words, numbers, or symbols anywhere in the image.",
    "- NO logos, NO watermarks, NO discount badges, NO sale signs, NO price tags, NO promotional banners.",
    "- NO over-saturation, NO HDR glow, NO cartoonish colors.",
    "- Do NOT make this look like a designed poster, ad template, or social-card mockup.",
    "ANATOMY CONSTRAINTS (strictly enforced):",
    "- Every person must have a NORMAL, CORRECT human anatomy — exactly 2 arms, 2 hands, 10 fingers total.",
    "- NEVER show more than ONE person's hands in the same frame at the same time.",
    "- If a treatment involves both a client and a therapist, crop tightly enough that only ONE set of hands is visible — never both.",
    "- Prefer shots of the client's face/skin result, a single person's hands, or a product close-up rather than a two-person interaction.",
    "- NO extra limbs, floating hands, merged fingers, or anatomically incorrect extremities of any kind.",
    "- Faces must have correct proportions: two eyes, one nose, one mouth — never distorted or duplicated features.",
    input.ownerDirection ? "" : null,
    input.ownerDirection
      ? `OWNER'S ADDITIONAL DIRECTION: "${input.ownerDirection}". Incorporate this naturally into the photograph.`
      : null,
  ];

  return lines.filter((line) => line !== null && line !== undefined).join("\n");
}

// ─── Service-category subject pools ─────────────────────────────────────────
//
// The generic per-profile blueprint subjects produce off-topic visuals when
// the actual sale is for a specific service category — e.g. an Eyelash
// promo shouldn't surface a serum-bottle macro just because the random pick
// landed there. These pools keep the visual MATTER aligned with what's
// actually being sold, while the chosen profile still controls the mood,
// palette, and finish.
//
// All entries enforce a single-person rule and avoid disallowed compositions
// like "two people's hands in frame" (which the underlying gen models
// frequently get wrong).

type ServiceCategoryKey =
  | "EYELASH"
  | "BROW"
  | "NAILS"
  | "SKIN"
  | "FACIAL"
  | "MASSAGE"
  | "SPA"
  | "HAIR"
  | "MAKEUP"
  | "BODY"
  | "WAXING";

const SUBJECT_BY_CATEGORY: Record<ServiceCategoryKey, readonly string[]> = {
  EYELASH: [
    "extreme close-up of one eye with long, perfectly styled eyelash extensions — eye gently closed, soft directional light, lashes fanned and curled",
    "macro shot of an eye area mid-lash-extension service — clean isolation pads under the eye, ONE technician's gloved fingertip with a single tweezer visible, never both technician and client hands in the same frame, sterile precision",
    "lash-tray flat-lay on a clean linen surface — individual lash trays, lash tweezers, fan brush — top-down macro, no people",
    "after-look portrait of a calm client's resting face — eyes closed, softly fanned natural-looking extensions visible, warm light",
    "before-and-after style single hero shot focused on the upper face — full set of crisp lash extensions, no skincare props",
  ],
  BROW: [
    "close-up of an eyebrow being shaped with a single brow brush — only client's brow visible, no second hand in frame",
    "after-look portrait of perfectly groomed, lifted brows — natural arch, soft fluffy hairs, gentle skin texture",
    "brow-lamination tools flat-lay — brow brush, gel pots, micro scissors on a linen surface, top-down macro",
    "macro of a brow being measured with mapping string against the face — single technician hand only, precise studio light",
  ],
  NAILS: [
    "elegant overhead shot of one client's hands resting on a clean towel showing a fresh manicure — polish glossy, cuticles tidy, no other hands in frame",
    "close-up macro of just-painted nails being held up to soft light — one hand only, polished bottle softly out of focus behind",
    "nail-art detail shot — single hand laying flat, intricate art on one nail in sharp focus, the rest gently bokeh",
    "flat-lay of polish bottles, nail file, cuticle oil on a marble surface — top-down macro, no people",
    "pedicure-result close-up — clean toes with fresh polish on a plush towel, no hands in frame",
  ],
  SKIN: [
    "extreme close-up of dewy, freshly-treated skin on a single cheek — sidelight catching natural moisture, no products visible",
    "amber dropper bottle held in one client hand near (but not on) the face — bottle sharp, face softly out of focus",
    "single hand applying serum to one cheek — calm expression, no second person's hands visible",
    "after-facial portrait — relaxed face, glowing skin, soft natural light, eyes closed",
    "skincare flat-lay — dropper, jar, ceramic spoon, fresh herbs on cream linen — top-down macro, no people",
  ],
  FACIAL: [
    "client lying back during a facial — eyes closed, soft towel around hair, gentle ambient light, ONE technician hand applying product visible at the edge of the frame, never two pairs of hands",
    "post-facial portrait — calm closed eyes, freshly cleansed luminous skin, no makeup",
    "facial-bar flat-lay — sheet masks, jade roller, ceramic bowl with floating petals, soft linen ground",
    "macro of a single hand smoothing cream onto the cheek — only client's face and one hand in frame",
  ],
  MASSAGE: [
    "view of a single shoulder and neck during a massage — therapist's gloved hand with massage oil visible at the edge, never two pairs of hands at once, soft warm light",
    "still life of massage props — folded towels, river stones, bottle of oil, small candle on a wooden surface, top-down",
    "after-massage portrait — face down on the table, calm relaxed expression, eyes closed, soft towels framing the face",
    "macro of a single hand gliding along a forearm with oil — only one person's hand visible, warm sidelight",
  ],
  SPA: [
    "spa still life — folded white towels, small ceramic bowl, sprig of eucalyptus, small candle on a stone surface, warm ambient light",
    "footbath close-up — feet in a wooden basin with petals floating, no hands in frame",
    "calm portrait of a client wrapped in a soft robe and head-towel, eyes closed, candlelit warmth",
    "macro of steaming herbal tea served in a ceramic cup beside spa towels — no people",
  ],
  HAIR: [
    "after-look portrait of fresh hair color or treatment — glossy, hydrated hair, soft side light, single subject only",
    "close-up of glossy hair detail — strands catching the light, no people's hands in frame",
    "salon-station flat-lay — single brush, single tinted bowl, comb, on a clean counter, top-down",
    "client mid-treatment — head only, eyes closed, ONE stylist hand visible at the edge holding a brush, never two pairs of hands",
  ],
  MAKEUP: [
    "after-makeup portrait — clean, polished look, natural skin texture under the makeup, soft light, single subject only",
    "macro of a perfectly painted lip with a single brush hovering — one hand only",
    "makeup-tools flat-lay — brushes lined up, palette open, lipstick on linen, top-down macro, no people",
    "close-up of just one eye with finished eyeshadow — closed gently, lashes visible, no second hand in frame",
  ],
  BODY: [
    "single bare shoulder and collarbone with golden rim light — luminous skin texture, no products in frame",
    "body-care still life — body scrub jar, loofah, towel, bar of soap on a stone surface, top-down macro",
    "macro of moisturizer being applied to a single forearm — one hand only, soft warm light",
    "after-treatment portrait — relaxed shoulders in a soft robe, calm closed eyes",
  ],
  WAXING: [
    "post-wax leg detail — clean smooth skin against a soft white towel, no hands in frame",
    "tools-of-the-trade flat-lay — wax pot, spatula, strips, clean towel — top-down on a clean surface, no people",
    "macro of fingers checking a cooled wax strip on a clean tray — one hand only, never two",
    "after-look close-up of an eyebrow shape post-wax — single client face, no technician hands",
  ],
};

const CATEGORY_ALIAS: Record<string, ServiceCategoryKey> = {
  // Direct category names (case-insensitive match below)
  EYELASH: "EYELASH",
  EYELASHES: "EYELASH",
  LASHES: "EYELASH",
  LASH: "EYELASH",
  BROW: "BROW",
  BROWS: "BROW",
  EYEBROW: "BROW",
  EYEBROWS: "BROW",
  NAIL: "NAILS",
  NAILS: "NAILS",
  MANICURE: "NAILS",
  PEDICURE: "NAILS",
  SKIN: "SKIN",
  SKINCARE: "SKIN",
  FACIAL: "FACIAL",
  FACIALS: "FACIAL",
  FACE: "FACIAL",
  MASSAGE: "MASSAGE",
  MASSAGES: "MASSAGE",
  SPA: "SPA",
  WELLNESS: "SPA",
  HAIR: "HAIR",
  HAIRCUT: "HAIR",
  COLOR: "HAIR",
  COLORING: "HAIR",
  MAKEUP: "MAKEUP",
  COSMETICS: "MAKEUP",
  BODY: "BODY",
  WAXING: "WAXING",
  WAX: "WAXING",
};

/**
 * Pick a service-category-aware subject for the image. We look across both
 * service categories AND service NAMES (since service names are what owners
 * type and may carry the category signal even when the category column is
 * generic). Returns null when nothing maps cleanly — caller falls back to
 * the profile's generic subject pool.
 */
function pickServiceAwareSubject(
  serviceNames: string[],
  serviceCategories: string[],
): string | null {
  const haystack = [...serviceCategories, ...serviceNames]
    .map((value) => value.toUpperCase())
    .join(" ");
  if (!haystack.trim()) return null;

  // Score each category by how many of its alias tokens appear in the
  // service names + categories. Highest hit count wins.
  const scores = new Map<ServiceCategoryKey, number>();
  for (const [alias, key] of Object.entries(CATEGORY_ALIAS)) {
    // Word-boundary match so "BROWN" doesn't trigger BROW.
    const re = new RegExp(`\\b${alias}\\b`);
    if (re.test(haystack)) {
      scores.set(key, (scores.get(key) ?? 0) + 1);
    }
  }

  let bestKey: ServiceCategoryKey | null = null;
  let bestScore = 0;
  for (const [key, score] of scores) {
    if (score > bestScore) {
      bestKey = key;
      bestScore = score;
    }
  }

  if (!bestKey) return null;
  const pool = SUBJECT_BY_CATEGORY[bestKey];
  if (!pool || pool.length === 0) return null;
  return pickRandom(pool);
}

export function buildSocialImagePrompt(input: PromoImageInput): string {
  const services = dedupeStrings(input.serviceNames);
  const categories = dedupeStrings(input.serviceCategories);
  const packages = dedupeStrings(input.packageNames);

  const serviceContext =
    services.length > 0
      ? services.slice(0, 5).join(", ")
      : packages.length > 0
        ? packages.slice(0, 5).join(", ")
        : categories.length > 0
          ? categories.join(", ")
          : null;

  const dateRange = formatDateRange(input.startDate, input.endDate);
  const seasonLine = inferSeasonContext(input.title, dateRange);
  const hookContext = extractCaptionHook(input.captionText);

  const isNonDiscountAction =
    input.actionCategory === "SOCIAL_ONLY" ||
    input.actionCategory === "AWARENESS";
  const hasDiscount = input.discountValue > 0 && !isNonDiscountAction;

  const discountBlurb = hasDiscount
    ? input.discountType === "PERCENTAGE"
      ? `${input.discountValue}% off promo, but DO NOT render this number in the image — it stays in the caption only`
      : `flat-amount promo, but DO NOT render any price in the image — it stays in the caption only`
    : "non-discount campaign — focus purely on the mood, no promotional cues in-frame";

  const contextLine = `Campaign "${input.title}" for ${input.businessName} — ${discountBlurb}. Window: ${dateRange}.${input.saleDescription ? ` ${input.saleDescription.trim()}.` : ""}`;

  // Prefer a service-category-aware subject so the image actually shows what's
  // being sold. Falls back to the profile's generic subject pool when the
  // services don't map to a known category.
  const subjectOverride = pickServiceAwareSubject(services, categories);

  return buildPhotographyPrompt({
    imageProfile: input.imageProfile || DEFAULT_SOCIAL_IMAGE_PROFILE,
    variant: "promo",
    businessName: input.businessName,
    contextLine,
    seasonLine,
    serviceContext,
    hookContext,
    visualMood: null,
    visualFocus: null,
    ownerDirection: input.ownerImageDirection?.trim() || null,
    subjectOverride: subjectOverride ?? undefined,
  });
}

const ORGANIC_CATEGORY_SUBJECT: Record<OrganicPostCategory, string> = {
  SERVICE_SHOWCASE:
    "Close-up beauty or wellness result — a single person's glowing skin, well-groomed nails, or relaxed hands after a treatment, elegant tools nearby, warm shallow-depth bokeh background. Only ONE person's hands visible at a time.",
  BEHIND_THE_SCENES:
    "Candid documentary moment — a staff member preparing their workstation, laying out tools, or reviewing notes before a client arrives. Natural window light, unstaged and real.",
  TIPS_EDUCATION:
    "Clean, well-lit flat-lay of skincare or beauty tools and products on a neutral linen or marble surface. Top-down macro framing, precise styling, no clutter.",
  SEASONAL_GREETING:
    "Lifestyle still life with seasonal botanical props — flowers, candles, spa towels, seasonal greenery — arranged in a warm, textured environment with soft ambient light.",
  TEAM_SPOTLIGHT:
    "Genuine team portrait in a spa or salon — relaxed authentic smile, natural soft side light. Not a corporate headshot — warm, approachable, real.",
  GENERAL:
    "Lifestyle wellness moment inside a modern beauty salon or spa — serene, inviting atmosphere, warm ambient light, clean surfaces.",
};

export function buildOrganicImagePrompt(input: OrganicImageInput): string {
  const profile = input.imageProfile || DEFAULT_SOCIAL_IMAGE_PROFILE;
  // Warm Editorial profile gets the variation pool; everything else uses the
  // category-specific direction.
  const subjectOverride =
    profile === "WARM_EDITORIAL"
      ? pickRandom(PROFILE_BLUEPRINTS.WARM_EDITORIAL.subjects)
      : ORGANIC_CATEGORY_SUBJECT[input.category];

  const seasonLine = inferSeasonContext(input.topic, "ongoing");
  const hookContext = extractCaptionHook(input.captionText);

  const contextLine = `Organic ${input.category.replaceAll("_", " ").toLowerCase()} post for ${input.businessName} on the topic "${input.topic}".`;

  return buildPhotographyPrompt({
    imageProfile: profile,
    variant: "organic",
    businessName: input.businessName,
    contextLine,
    seasonLine,
    serviceContext: null,
    hookContext,
    visualMood: input.visualMood?.trim() || null,
    visualFocus: input.visualFocus?.trim() || null,
    ownerDirection: input.ownerDirection?.trim() || null,
    subjectOverride,
  });
}

// ─── Generation ─────────────────────────────────────────────────────────────

type ImageBytes = { bytes: Buffer; mimeType: string };

async function attemptOpenAI(prompt: string): Promise<ImageBytes | null> {
  if (!isOpenAIImageConfigured()) return null;
  try {
    return await generateOpenAIImage({ prompt });
  } catch (error) {
    logger.warn("[Social] OpenAI image generation failed; will try fallback.", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function attemptGemini(prompt: string): Promise<ImageBytes | null> {
  if (!isGeminiConfigured()) return null;
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  try {
    return await generateGeminiImage({ model, prompt });
  } catch (error) {
    logger.warn("[Social] Gemini image generation failed.", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function uploadImage(input: {
  bytes: Buffer;
  mimeType: string;
  fileBase: string;
}) {
  const extension = mimeTypeToExtension(input.mimeType);
  const fileName = `${input.fileBase}-${Date.now()}.${extension}`;
  const blob = await put(fileName, input.bytes, {
    access: "public",
    addRandomSuffix: true,
    contentType: input.mimeType,
  });
  return blob.url;
}

/**
 * Generate raw image bytes from the AI providers. Tries OpenAI first, then
 * Gemini, with a single backoff retry on transient failure.
 */
async function generateBackgroundBytes(prompt: string): Promise<ImageBytes | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const openai = await attemptOpenAI(prompt);
    if (openai) return openai;
    const gemini = await attemptGemini(prompt);
    if (gemini) return gemini;
    if (attempt === 0) {
      // Brief backoff — covers transient 5xx / rate spikes.
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  return null;
}

export async function generateAndUploadPromoImage(
  input: PromoImageInput,
): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    logger.warn(
      "[Social] BLOB_READ_WRITE_TOKEN not configured; skipping image upload.",
    );
    return null;
  }

  const prompt = buildSocialImagePrompt(input);
  const background = await generateBackgroundBytes(prompt);
  if (!background) return null;

  const isNonDiscount =
    input.actionCategory === "SOCIAL_ONLY" ||
    input.actionCategory === "AWARENESS";

  // Compose the clean SVG-rendered text overlay on the AI photograph. This is
  // why text on sale promos always reads correctly — the AI never has to
  // render letters.
  const composed = await composeSalePromoOverlay(background.bytes, {
    businessName: input.businessName,
    headline: input.title,
    discountType: input.discountType,
    discountValue: input.discountValue,
    startDate: input.startDate,
    endDate: input.endDate,
    isNonDiscount,
  });

  return uploadImage({
    bytes: composed.bytes,
    mimeType: composed.mimeType,
    fileBase: `social-promo-${input.businessSlug}`,
  });
}

export async function generateAndUploadOrganicImage(
  input: OrganicImageInput,
): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    logger.warn(
      "[Social] BLOB_READ_WRITE_TOKEN not configured; skipping image upload.",
    );
    return null;
  }

  const prompt = buildOrganicImagePrompt(input);
  const background = await generateBackgroundBytes(prompt);
  if (!background) return null;

  // Organic posts are pure photography by default. If the owner wants their
  // brand stamped onto the image, compose a clean small watermark.
  if (input.imprintBusinessName) {
    const composed = await composeBusinessNameWatermark(background.bytes, {
      businessName: input.businessName,
    });
    return uploadImage({
      bytes: composed.bytes,
      mimeType: composed.mimeType,
      fileBase: `social-organic-${input.businessSlug}`,
    });
  }

  return uploadImage({
    bytes: background.bytes,
    mimeType: background.mimeType,
    fileBase: `social-organic-${input.businessSlug}`,
  });
}
