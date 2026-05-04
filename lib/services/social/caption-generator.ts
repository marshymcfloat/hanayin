import { DiscountType } from "@/prisma/generated/prisma/enums";
import { logger } from "@/lib/logger";
import {
  generateGeminiText,
  isGeminiConfigured,
} from "@/lib/services/social/gemini-client";

export type ActionCategory = "DISCOUNT" | "SOCIAL_ONLY" | "AWARENESS";

export type CaptionGenerationInput = {
  businessSlug: string;
  businessName: string;
  businessDescription?: string | null;
  saleTitle: string;
  saleDescription?: string | null;
  discountType?: DiscountType;
  discountValue?: number;
  startDate: Date;
  endDate: Date;
  serviceNames?: string[];
  serviceCategories?: string[];
  packageNames?: string[];
  allowRewritePass?: boolean;
  actionCategory?: ActionCategory;
  /**
   * Owner-selected (or engine-recommended) caption tone. Maps to a
   * specific voice instruction injected into the LLM prompt. "AUTO" or
   * undefined means the engine picks based on the offer + season.
   */
  captionTone?:
    | "AUTO"
    | "FRIENDLY_TAGLISH"
    | "PREMIUM_LUXURY"
    | "WITTY_PLAYFUL"
    | "WARM_NURTURING"
    | "DIRECT_URGENT";
  /**
   * Free-text owner direction. Inserted into the LLM prompt verbatim so
   * the writer can lean into specific angles ("emphasize the bestie-bonding
   * angle", "mention rainy season").
   */
  ownerCaptionDirection?: string;
  /**
   * Optional custom fallback used when Gemini is unconfigured / fails /
   * returns low-quality output. Defaults to the sale-flavored rescue,
   * which is the right shape for sale-event captions but produces
   * inappropriate "Bookings open today" copy for organic content (tips,
   * behind-the-scenes, seasonal greetings). Organic callers pass
   * buildOrganicRescueCaption so the fallback respects category.
   */
  customRescueBuilder?: (
    input: CaptionGenerationInput,
  ) => CaptionGenerationOutput;
};

const TONE_GUIDE: Record<NonNullable<CaptionGenerationInput["captionTone"]>, string> = {
  AUTO: "",
  FRIENDLY_TAGLISH:
    "Voice: warm, conversational Filipino-English. Like texting a friend who's hyping you up about self-care. Light humor okay, no slang that ages badly.",
  PREMIUM_LUXURY:
    "Voice: refined, considered, slightly editorial. Speak as a premium spa/clinic — feel boutique. Use restraint. No exclamation marks, no emoji.",
  WITTY_PLAYFUL:
    "Voice: cheeky, clever, a little tongue-in-cheek. One-liners and observational humor. Stay tasteful — never mean-spirited.",
  WARM_NURTURING:
    "Voice: gentle, reassuring, like a caring friend. Acknowledge that life is busy, invite without pressure, focus on rest and recovery.",
  DIRECT_URGENT:
    "Voice: confident, direct, present-tense. Short punchy lines. Make the booking window obvious. No padding — every line moves the reader closer to booking.",
};

export type CaptionGenerationOutput = {
  caption: string;
  hashtags: string[];
};

export type SocialCaptionStyle =
  | "INFORMATIVE"
  | "FUNNY_LIGHT"
  | "URGENCY_DRIVEN"
  | "PREMIUM_TONE"
  | "QUESTION_ENGAGEMENT";

export type SocialCaptionVariant = {
  style: SocialCaptionStyle;
  caption: string;
  hashtags: string[];
  ctaOptions: string[];
  overlaySuggestion: string;
};

const MAX_HASHTAG_LENGTH = 28;
const MIN_ACCEPTABLE_WORDS = 55;
const MIN_ACCEPTABLE_LINES = 8;
const REQUIRED_CTA_LINE = "Book now through ServiceFlow and claim your spot today.";
// Voice note: posts are FROM the business, so first-person plural ("we / our")
// not third-person ("they"). Caller is the singular reader, so "yourself".
const REQUIRED_DISCOVERY_LINE =
  "Tap through to see everything we offer and book yourself in.";
// Legacy variants we still strip if they sneak through from older drafts —
// keeps re-runs idempotent and doesn't double up old/new copy on edits.
const LEGACY_DISCOVERY_LINES = [
  "you can book yourselves in and see all services they offer.",
  "and see all what they offer",
];
const STYLE_ORDER: SocialCaptionStyle[] = [
  "INFORMATIVE",
  "FUNNY_LIGHT",
  "URGENCY_DRIVEN",
  "PREMIUM_TONE",
  "QUESTION_ENGAGEMENT",
];
const INTERNAL_SIGNAL_PATTERNS = [
  "window is active",
  "15/30 behavior",
  "high intent promo",
  "high-intent promo",
  "opportunity signal",
  "confidence score",
  "can drive prep bookings",
  // Internal opportunity terminology — must NEVER leak into a public caption.
  // Keep these in lowercase; the matcher already lowercases the line.
  "quiet hours",
  "slow hours",
  "low traffic",
  "low-traffic",
  "dead hours",
  "off-peak hours",
  "off peak hours",
  "fill window",
  "fill the window",
  "rescue",
];

const INTERNAL_TITLE_TOKENS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bquiet\s+hours?\b/gi, replacement: "Mid-Week" },
  { pattern: /\bslow\s+hours?\b/gi, replacement: "Mid-Week" },
  { pattern: /\bdead\s+hours?\b/gi, replacement: "Mid-Week" },
  { pattern: /\boff[-\s]?peak\b/gi, replacement: "Mid-Week" },
  { pattern: /\b(2|3|4|5)\s*pm\s+rescue\b/gi, replacement: "Afternoon Treat" },
  { pattern: /\brescue\b/gi, replacement: "Refresh" },
];

// If a legacy or owner-edited title still contains internal-sounding words,
// soften them before they reach the public caption / image overlay.
function neutralizePublicTitle(value: string): string {
  let out = value;
  for (const rule of INTERNAL_TITLE_TOKENS) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}
const RESCUE_HOOK_LINES = [
  "Quick glow-up day? We got you.",
  "If your week needs a reset, this is your sign.",
  "Fresh look, calm mood, better day. Tara.",
  "Good energy starts with good self-care.",
  "Plan your little reset and make it count.",
  "Ready for a feel-good refresh today?",
  "Small self-care moves make a big difference.",
  "Your next favorite treatment day starts here.",
];
const CAPTION_HOOK_STYLES = [
  "teasing-question",
  "bold-relatable-one-liner",
  "funny-work-burnout-callout",
  "self-care-guilty-pleasure",
] as const;
const CAPTION_PERSUASION_ANGLES = [
  "limited-slots urgency",
  "reward-yourself framing",
  "bestie-or-partner bonding",
  "confidence-and-glow-up outcome",
] as const;
const CAPTION_TONE_TWISTS = [
  "playful and cheeky",
  "warm and nurturing",
  "confident and premium",
  "lightly witty and conversational",
] as const;

type SeasonSignal = {
  seasonLabel: string;
  seasonLine: string;
};

function formatDiscount(discountType?: DiscountType, discountValue?: number) {
  if (!discountType || !discountValue || discountValue <= 0) {
    return "No discount — full price";
  }
  if (discountType === "PERCENTAGE") {
    return `${discountValue}% OFF`;
  }
  return `PHP ${discountValue.toFixed(0)} OFF`;
}

function isNonDiscountAction(input: CaptionGenerationInput): boolean {
  return input.actionCategory === "SOCIAL_ONLY" || input.actionCategory === "AWARENESS";
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

function formatDateWindow(startDate: Date, endDate: Date) {
  const formatter = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
  });
  if (isSameCalendarDay(startDate, endDate)) {
    return formatter.format(startDate);
  }
  return `${formatter.format(startDate)} to ${formatter.format(endDate)}`;
}

function buildPromoTimingLine(
  startDate: Date,
  endDate: Date,
  options: { isNonDiscount?: boolean } = {},
) {
  const sameDay = isSameCalendarDay(startDate, endDate);
  if (options.isNonDiscount) {
    if (sameDay) return "Bookings open today.";
    return `Bookings open ${formatDateWindow(startDate, endDate)}.`;
  }
  if (sameDay) return "Flash sale — today only.";
  return `Promo runs ${formatDateWindow(startDate, endDate)}.`;
}

function toHashtagSeed(value: string) {
  return value
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function normalizeHashtag(value: string) {
  const seed = value.replace(/^#/, "").trim();
  if (!seed) return null;

  const compact = seed.replace(/[^a-zA-Z0-9_]/g, "");
  if (!compact) return null;

  if (compact.length > MAX_HASHTAG_LENGTH) {
    return `#${compact.slice(0, MAX_HASHTAG_LENGTH)}`;
  }

  return `#${compact}`;
}

function uniqueHashtags(values: string[]) {
  const normalized = values
    .map((value) => normalizeHashtag(value))
    .filter((value): value is string => !!value);

  return Array.from(new Set(normalized)).slice(0, 10);
}

function normalizeCategory(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function dedupeCategories(values?: string[]) {
  if (!values?.length) return [];
  return Array.from(
    new Set(values.map((value) => normalizeCategory(value)).filter(Boolean)),
  ).slice(0, 6);
}

function sanitizeSaleDescriptionForPublic(value?: string | null) {
  if (!value) return "";
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isInternalMetaLine(line));
  return lines.join(" ").trim();
}

function sanitizeSaleTitleForPublic(value: string) {
  const cleaned = value
    .replace(/\s*\((?:draft suggestion|draft)\)\s*/gi, " ")
    .replace(/\s*[-–—]\s*(?:draft suggestion|draft)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return neutralizePublicTitle(cleaned || value.trim());
}

function buildFallbackHashtags(input: CaptionGenerationInput) {
  const serviceTags = (input.serviceNames ?? [])
    .map((name) => toHashtagSeed(name))
    .filter((tag) => tag.length > 0 && tag.length <= MAX_HASHTAG_LENGTH)
    .slice(0, 2);

  return uniqueHashtags([
    "ServiceFlow",
    "SelfCarePH",
    "SulitPromo",
    "BookNow",
    toHashtagSeed(input.businessName),
    ...dedupeCategories(input.serviceCategories).map((category) =>
      toHashtagSeed(category),
    ),
    ...serviceTags,
  ]);
}

function sanitizeBusinessSlug(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function buildServiceFlowUrl(businessSlug: string) {
  const slug = sanitizeBusinessSlug(businessSlug);
  return slug
    ? `https://www.serviceflow.store/${slug}`
    : "https://www.serviceflow.store";
}

function pickRandom<T>(items: readonly T[]) {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function inferSeasonSignal(input: CaptionGenerationInput): SeasonSignal {
  const saleTitle = sanitizeSaleTitleForPublic(input.saleTitle);
  const title = saleTitle.toLowerCase();
  const dateWindow = formatDateWindow(input.startDate, input.endDate);

  if (/(valentine|date|hearts?|love month|couple)/i.test(title)) {
    return {
      seasonLabel: "Valentine season",
      seasonLine:
        "Season cue from title: Valentine season and love-month self-care moments.",
    };
  }

  if (/(summer|tag-init|beach|sunshine|heat)/i.test(title)) {
    return {
      seasonLabel: "Summer season",
      seasonLine: "Season cue from title: Summer season, fresh glow, and feel-good reset.",
    };
  }

  if (/(christmas|xmas|holiday|new year|ber month|ber)/i.test(title)) {
    return {
      seasonLabel: "Holiday season",
      seasonLine:
        "Season cue from title: Holiday season prep, party-ready confidence, and gifting energy.",
    };
  }

  if (/(rainy|tag-ulan|ulan|monsoon)/i.test(title)) {
    return {
      seasonLabel: "Rainy season",
      seasonLine:
        "Season cue from title: Rainy-season comfort care and stress-relief downtime.",
    };
  }

  if (/(back to school|school|enrollment)/i.test(title)) {
    return {
      seasonLabel: "Back-to-school season",
      seasonLine:
        "Season cue from title: Back-to-school reset, confidence boost, and routine self-care.",
    };
  }

  if (/(holy week|easter|lenten|lent)/i.test(title)) {
    return {
      seasonLabel: "Holy Week season",
      seasonLine:
        "Season cue from title: Holy Week break and quiet recharge for body and mind.",
    };
  }

  if (/(mother|mother's|mothers day|nanay)/i.test(title)) {
    return {
      seasonLabel: "Mother's Day season",
      seasonLine:
        "Season cue from title: Mother's Day season and quality self-care time with family.",
    };
  }

  if (/(father|father's|fathers day|tatay)/i.test(title)) {
    return {
      seasonLabel: "Father's Day season",
      seasonLine:
        "Season cue from title: Father's Day season and recovery-focused wellness offers.",
    };
  }

  return {
    seasonLabel: "current promo season",
    seasonLine: `Season cue from title/date: "${saleTitle}" running ${dateWindow}.`,
  };
}

function buildCaptionPromptVariation() {
  return {
    hookStyle: pickRandom(CAPTION_HOOK_STYLES),
    persuasionAngle: pickRandom(CAPTION_PERSUASION_ANGLES),
    toneTwist: pickRandom(CAPTION_TONE_TWISTS),
    variationSeed: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000)}`,
  };
}

function isBulletLine(line: string) {
  return /^[-*\u2022\u25E6\u2043]+\s+/.test(line.trim());
}

function isHeadingLikeLine(line: string) {
  const normalized = line.trim().toLowerCase();
  return (
    normalized.startsWith("try these") ||
    normalized.startsWith("our services") ||
    normalized.startsWith("featured services") ||
    normalized.startsWith("included in this promo") ||
    normalized.startsWith("crowd favorites")
  );
}

function isCtaLine(line: string) {
  const normalized = line.trim().toLowerCase();
  return (
    normalized.includes("book now") ||
    normalized.includes("reserve") ||
    normalized.includes("dm ") ||
    normalized.includes("message us") ||
    normalized.includes("call ")
  );
}

function isEmojiCodePoint(value: string) {
  return /\p{Extended_Pictographic}/u.test(value);
}

function normalizeBulletLine(line: string) {
  const trimmed = line.trim();

  if (isBulletLine(trimmed)) {
    const content = trimmed
      .replace(/^[-*\u2022\u25E6\u2043]+\s+/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return content ? `- ${content}` : "";
  }

  const first = Array.from(trimmed)[0] || "";
  if (!isEmojiCodePoint(first)) {
    return trimmed;
  }

  const withoutLeadingEmoji = trimmed
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!withoutLeadingEmoji) return "";
  return `- ${withoutLeadingEmoji}`;
}

function splitDenseLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (
    trimmed.length < 170 ||
    isBulletLine(trimmed) ||
    isHeadingLikeLine(trimmed) ||
    isCtaLine(trimmed) ||
    /^https?:\/\//i.test(trimmed) ||
    /^www\./i.test(trimmed)
  ) {
    return [trimmed];
  }

  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (sentences.length < 2) {
    return [trimmed];
  }

  const pivot = Math.ceil(sentences.length / 2);
  const firstPart = sentences.slice(0, pivot).join(" ").trim();
  const secondPart = sentences.slice(pivot).join(" ").trim();
  return [firstPart, secondPart].filter(Boolean);
}

function limitEmojiDensity(value: string, maxEmojiCount = 2) {
  let keptEmoji = 0;
  let previousKeptWasEmoji = false;
  let output = "";

  for (const char of Array.from(value)) {
    if (isEmojiCodePoint(char)) {
      if (keptEmoji >= maxEmojiCount) {
        previousKeptWasEmoji = false;
        continue;
      }
      keptEmoji += 1;
      previousKeptWasEmoji = true;
      output += char;
      continue;
    }

    if (char === "\uFE0F" || char === "\u200D") {
      if (previousKeptWasEmoji) {
        output += char;
      }
      continue;
    }

    previousKeptWasEmoji = false;
    output += char;
  }

  return output;
}

function normalizeCaptionStructure(value: string) {
  const expandedLines = value
    .split("\n")
    .map((line) => normalizeBulletLine(line))
    .filter(Boolean)
    .flatMap((line) => splitDenseLine(line));

  const normalized = expandedLines
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return limitEmojiDensity(normalized, 2);
}

function formatCaptionForSocialFeed(value: string) {
  const sourceLines = normalizeCaptionStructure(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (sourceLines.length === 0) {
    return value.trim();
  }

  const outputLines: string[] = [];

  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index];
    const prev = sourceLines[index - 1] || "";
    const next = sourceLines[index + 1] || "";
    const lineIsBullet = isBulletLine(line);
    const prevIsBullet = isBulletLine(prev);
    const nextIsBullet = isBulletLine(next);

    const needsLeadingBreak =
      index > 0 &&
      !prevIsBullet &&
      (lineIsBullet || isHeadingLikeLine(line) || isCtaLine(line));

    if (needsLeadingBreak && outputLines[outputLines.length - 1] !== "") {
      outputLines.push("");
    }

    if (!lineIsBullet && prevIsBullet && outputLines[outputLines.length - 1] !== "") {
      outputLines.push("");
    }

    outputLines.push(line);

    if (!lineIsBullet && nextIsBullet) {
      outputLines.push("");
    }
  }

  return outputLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isServiceFlowEndingLine(line: string) {
  const normalized = line.trim().toLowerCase();
  return (
    normalized.startsWith("book now through serviceflow") ||
    normalized.startsWith("www.serviceflow") ||
    normalized.startsWith("http://www.serviceflow") ||
    normalized.startsWith("https://www.serviceflow") ||
    normalized === REQUIRED_DISCOVERY_LINE.toLowerCase() ||
    LEGACY_DISCOVERY_LINES.includes(normalized)
  );
}

function enforceServiceFlowEnding(caption: string, businessSlug: string) {
  const bodyLines = caption
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !isServiceFlowEndingLine(line));

  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1]?.trim() === "") {
    bodyLines.pop();
  }

  const footerLines = [
    REQUIRED_CTA_LINE,
    REQUIRED_DISCOVERY_LINE,
    buildServiceFlowUrl(businessSlug),
  ];

  const body = bodyLines.join("\n").trim();
  const merged = body ? `${body}\n\n${footerLines.join("\n")}` : footerLines.join("\n");
  return formatCaptionForSocialFeed(merged);
}

function cleanCaptionText(value: string) {
  const cleaned = value
    .replace(/^\s*{\s*/, "")
    .replace(/^\s*"caption"\s*:\s*/i, "")
    .replace(/^"+/, "")
    .replace(/"+$/, "");

  const lines = cleaned
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(
      (line, index, array) => !(line.trim() === "" && index === array.length - 1),
    );

  while (lines.length > 0) {
    const lastLine = lines[lines.length - 1]?.trim() || "";
    if (/^(#[A-Za-z0-9_]+\s*)+$/.test(lastLine)) {
      lines.pop();
      continue;
    }
    break;
  }

  return stripInternalMetaLines(lines.join("\n").trim());
}

function isInternalMetaLine(line: string) {
  const normalized = line.trim().toLowerCase();
  if (!normalized) return false;

  if (/^upcoming\b.+\bcan drive prep bookings\.?$/.test(normalized)) return true;
  if (/^\d+(\.\d+)?%\s*off on .+ from .+ to .+\.?$/.test(normalized)) return true;
  if (normalized.includes("season is active")) return true;
  if (normalized.includes("can improve conversion")) return true;
  if (normalized.includes("review selected services/packages before publishing")) return true;
  if (normalized.includes("review selected services") && normalized.includes("before publishing")) {
    return true;
  }
  if (normalized.includes("student and family-prep offers")) return true;
  if (normalized.startsWith("focused categories:")) return true;
  if (normalized.startsWith("season cue from title")) return true;
  if (normalized.startsWith("season cue from title/date")) return true;
  if (normalized.includes("based on your") && normalized.includes("promo")) return true;
  if (normalized.includes("primary context source")) return true;
  if (INTERNAL_SIGNAL_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return true;
  }

  return false;
}

function stripInternalMetaLines(value: string) {
  const lines = value
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !isInternalMetaLine(line));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractHashtagsFromText(text: string) {
  const matches = text.match(/#[A-Za-z0-9_]+/g) ?? [];
  return uniqueHashtags(matches);
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function countNonEmptyLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function looksTruncated(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return true;
  if (/[,:-]$/.test(trimmed)) return true;

  const incompleteEndings = [
    " in a",
    " with",
    " and",
    " or",
    " for",
    " to",
    " sa",
    " ng",
    " na",
    " des",
  ];

  return incompleteEndings.some((ending) => trimmed.endsWith(ending));
}

function isLowQualityCaption(value: string) {
  const words = countWords(value);
  const lines = countNonEmptyLines(value);
  return words < MIN_ACCEPTABLE_WORDS || lines < MIN_ACCEPTABLE_LINES || looksTruncated(value);
}

/**
 * Title-case a service name while preserving common abbreviations and small
 * connector words. Owners enter service names with inconsistent casing —
 * "Regular manicure" / "Manicure gel" / "Eyelash Perming" — and the rescue
 * caption used to surface them verbatim, which read like a cobbled-together
 * list. This normalizer lower-bounds presentation quality without forcing
 * owners to clean up their service catalog first.
 */
const PRESERVE_TOKENS_LOWER = new Set(["of", "and", "the", "to", "for", "in", "with"]);
const ALWAYS_UPPER_TOKENS = new Set(["BB", "AHA", "BHA", "HD", "DIY", "VIP", "PH"]);

function titleCaseServiceName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((rawWord, index) => {
      if (!rawWord) return rawWord;
      if (ALWAYS_UPPER_TOKENS.has(rawWord.toUpperCase())) {
        return rawWord.toUpperCase();
      }
      const lower = rawWord.toLowerCase();
      if (index > 0 && PRESERVE_TOKENS_LOWER.has(lower)) {
        return lower;
      }
      // Handle hyphenated tokens segment-by-segment.
      return lower
        .split("-")
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join("-");
    })
    .join(" ");
}

function buildRescueCaptionDraft(input: CaptionGenerationInput): CaptionGenerationOutput {
  const services = (input.serviceNames ?? []).slice(0, 4).map(titleCaseServiceName);
  const packages = (input.packageNames ?? []).slice(0, 2).map(titleCaseServiceName);
  const items = [...services, ...packages].slice(0, 5);
  const season = inferSeasonSignal(input).seasonLabel.toLowerCase();
  const publicSaleDescription = sanitizeSaleDescriptionForPublic(input.saleDescription);
  const saleTitle = sanitizeSaleTitleForPublic(input.saleTitle);

  const lines = isNonDiscountAction(input)
    ? [
        pickRandom(RESCUE_HOOK_LINES),
        // Lead with the actual offer angle (publicDescription) instead of
        // the old generic "is here to make your ${season} extra special"
        // filler line. Falls back to a soft invite if nothing was passed.
        publicSaleDescription ||
          `Open slots at ${input.businessName} — book a self-care window that fits your schedule.`,
        // Always anchor the timeframe so the reader knows when to act.
        buildPromoTimingLine(input.startDate, input.endDate, {
          isNonDiscount: true,
        }),
        "If you've been putting off self-care dahil busy, this is a good time to finally book.",
        items.length > 0 ? "Here are some crowd favorites:" : "",
        ...items.map((item) => `- ${item}`),
        "Perfect for stress relief, confidence boost, and quality me-time.",
        "Pwede solo self-care day, pwede rin with your bestie, partner, or family.",
        "Preferred times fill up first, so reserve early para hindi ka maubusan.",
        "Tap the booking link below and secure your preferred schedule in minutes.",
      ].filter(Boolean)
    : [
        pickRandom(RESCUE_HOOK_LINES),
        `${saleTitle} is live at ${input.businessName} — feel-good self-care, ready when you are.`,
        `Enjoy ${formatDiscount(input.discountType, input.discountValue)} on this round, so mas sulit ang self-care plan mo.`,
        buildPromoTimingLine(input.startDate, input.endDate),
        publicSaleDescription,
        "If you've been putting off self-care dahil busy, this is a good time to finally book.",
        "Choose any treatment that fits your self-care mood this week.",
        items.length > 0 ? "Try these crowd favorites:" : "",
        ...items.map((item) => `- ${item}`),
        "Perfect for stress relief, confidence boost, and quality me-time.",
        "Pwede solo self-care day, pwede rin with your bestie, partner, or family.",
        "Slots are limited and preferred times fill up first, so reserve early para hindi ka maubusan.",
        "Tap the booking link below and secure your preferred schedule in minutes.",
      ].filter(Boolean);

  return {
    caption: formatCaptionForSocialFeed(lines.join("\n")),
    hashtags: buildFallbackHashtags(input),
  };
}

// ─── Organic post rescue captions ──────────────────────────────────
//
// The default buildRescueCaptionDraft above is sale-flavored — every
// category falls into it produces "Bookings open today" boilerplate. For
// organic posts (tips, behind-the-scenes, seasonal, team, general) that's
// the wrong shape. Each category gets its own rescue template here so
// that even when Gemini is unconfigured or fails, the owner sees content
// that actually matches the post type they picked.
//
// SERVICE_SHOWCASE intentionally falls through to the sale-style rescue
// below — it's a service-promotion category, so booking-forward copy is
// appropriate.

type OrganicRescueInput = {
  category: OrganicPostCategory;
  topic: string;
  businessName: string;
  businessSlug: string;
  ownerCaptionDirection?: string | null;
};

const TIPS_EDUCATION_OPENERS = [
  "Quick self-care tip you can try today:",
  "Sharing a small thing that makes a big difference:",
  "Today's wellness reminder:",
  "Real talk about everyday self-care:",
];

const BEHIND_THE_SCENES_OPENERS = [
  "Peek behind the scenes today.",
  "Here's what your appointment looks like before you even arrive:",
  "Care starts before you walk in.",
  "The little prep details no one talks about:",
];

const SEASONAL_OPENERS = [
  "Seasons change — your self-care can too.",
  "A small note on the season:",
  "Soft reminder for this time of year:",
];

const TEAM_OPENERS = [
  "The people behind your appointments.",
  "Meet the team that makes it happen:",
  "Today we're celebrating the people who do the work:",
];

const GENERAL_OPENERS = [
  "Just dropping in to say hi.",
  "A small note for the community:",
  "Sharing a moment from today:",
];

/**
 * Per-category rescue caption builder. Uses the topic and business
 * name; never invents booking promo for educational / behind-the-
 * scenes / seasonal content. Output is intentionally plain — when
 * Gemini comes back online the AI version takes over. This is the
 * "good enough so the owner can still publish" floor.
 */
export function buildOrganicRescueCaption(
  input: OrganicRescueInput,
): CaptionGenerationOutput {
  const topic = input.topic.trim() || "self-care";
  const direction = input.ownerCaptionDirection?.trim();
  const directionLine = direction ? `Note from us: ${direction}` : "";

  let lines: string[] = [];

  switch (input.category) {
    case "TIPS_EDUCATION": {
      const opener = pickRandom(TIPS_EDUCATION_OPENERS);
      lines = [
        opener,
        `Today's topic: ${topic}.`,
        "",
        "A few things worth knowing:",
        `• Be consistent — small habits compound faster than dramatic resets.`,
        `• Listen to what your skin / body is telling you, not the trend cycle.`,
        `• Ask before you experiment — your stylist or therapist has seen it before.`,
        "",
        directionLine,
        `If you want to talk through ${topic} with us, we're around.`,
      ].filter(Boolean);
      break;
    }
    case "BEHIND_THE_SCENES": {
      const opener = pickRandom(BEHIND_THE_SCENES_OPENERS);
      lines = [
        opener,
        `Today's behind-the-scenes: ${topic}.`,
        "",
        "Every appointment starts long before the chair.",
        "Tools sterilized, station laid out, products at room temperature.",
        "Small things, but they're why your visit feels effortless.",
        "",
        directionLine,
        `Catch the team in action when you book your next visit at ${input.businessName}.`,
      ].filter(Boolean);
      break;
    }
    case "SEASONAL_GREETING": {
      const opener = pickRandom(SEASONAL_OPENERS);
      lines = [
        opener,
        `${topic}.`,
        "",
        "Whatever you're celebrating today, take a beat for yourself too.",
        "A little rest, a slow morning, something that reminds you you're cared for.",
        "",
        directionLine,
        `From all of us at ${input.businessName} — sending you a warm wave.`,
      ].filter(Boolean);
      break;
    }
    case "TEAM_SPOTLIGHT": {
      const opener = pickRandom(TEAM_OPENERS);
      lines = [
        opener,
        `Spotlight: ${topic}.`,
        "",
        "The work you feel in the chair starts with the people who show up.",
        "Steady hands, real care, years of practice.",
        "We're grateful you keep choosing us.",
        "",
        directionLine,
        `Come meet the team at ${input.businessName}.`,
      ].filter(Boolean);
      break;
    }
    case "GENERAL": {
      const opener = pickRandom(GENERAL_OPENERS);
      lines = [
        opener,
        topic,
        "",
        "Pop into the page anytime — we share little notes, tips, and slow updates.",
        "",
        directionLine,
      ].filter(Boolean);
      break;
    }
    case "SERVICE_SHOWCASE":
    default: {
      // Service showcases are inherently promotional — fall through
      // to the sale-flavored rescue. Caller will compose CaptionGenerationInput
      // appropriately when this category is in play.
      lines = [
        `${topic} at ${input.businessName}.`,
        "",
        "Built for the kind of visit you remember.",
        "Quietly precise — you'll feel it in the small details.",
        directionLine,
        `Book your slot at ${input.businessName} when you're ready.`,
      ].filter(Boolean);
      break;
    }
  }

  return {
    caption: formatCaptionForSocialFeed(lines.join("\n")),
    hashtags: [],
  };
}

function finalizeCaptionOutput(
  output: CaptionGenerationOutput,
  input: CaptionGenerationInput,
): CaptionGenerationOutput {
  return {
    caption: enforceServiceFlowEnding(output.caption, input.businessSlug),
    hashtags: output.hashtags.length > 0 ? output.hashtags : buildFallbackHashtags(input),
  };
}

function buildGeminiPrompt(input: CaptionGenerationInput, dateWindow: string) {
  const season = inferSeasonSignal(input);
  const variation = buildCaptionPromptVariation();
  const publicSaleDescription = sanitizeSaleDescriptionForPublic(input.saleDescription);
  const categories = dedupeCategories(input.serviceCategories);
  const categoryLine = categories.length
    ? `Service categories (selected): ${categories.join(", ")}`
    : "Service categories (selected): none listed";
  const serviceLine = (input.serviceNames ?? []).length
    ? `Services: ${(input.serviceNames ?? []).join(", ")}`
    : "Services: none listed";
  const packageLine = (input.packageNames ?? []).length
    ? `Packages: ${(input.packageNames ?? []).join(", ")}`
    : "Packages: none listed";
  const saleTitle = sanitizeSaleTitleForPublic(input.saleTitle);

  // Owner-driven tone overrides the generic "playful + witty" default. AUTO
  // means no override — the prompt keeps its existing variation system.
  const toneOverride =
    input.captionTone && input.captionTone !== "AUTO"
      ? TONE_GUIDE[input.captionTone]
      : "";
  const ownerDirection = input.ownerCaptionDirection?.trim();

  return [
    "Write a high-converting social media caption for a Filipino audience.",
    toneOverride || "Voice: playful, witty, natural, and human.",
    "Language: Taglish (Filipino + English), everyday conversational style.",
    "Goal: invite and persuade customers to book now.",
    "Use clear line breaks for readability. Emojis are optional and should be minimal.",
    "Primary campaign context must rely on Sale title first, then sale description, then date window.",
    "Infer season/occasion mostly from the sale title and make that theme explicit in the caption.",
    ownerDirection
      ? `Owner's voice direction (treat as a soft requirement, not a literal quote): ${ownerDirection}`
      : "",
    "",
    "Output format:",
    "Prefer valid JSON with this exact shape:",
    '{"caption":"string","hashtags":["#TagOne","#TagTwo"]}',
    "No markdown code fences and no extra keys.",
    "If JSON is not possible, return plain text caption only.",
    "",
    `Business: ${input.businessName}`,
    `Business description: ${input.businessDescription?.trim() || "N/A"}`,
    `Sale title (primary context source): ${saleTitle}`,
    `Sale description: ${publicSaleDescription || "N/A"}`,
    ...(isNonDiscountAction(input)
      ? [`Action type: ${input.actionCategory} (NOT a sale — do NOT mention discounts, promos, or price reductions)`]
      : [`Discount: ${formatDiscount(input.discountType, input.discountValue)}`]),
    `Date window: ${dateWindow}`,
    `${season.seasonLine}`,
    `Creative variation seed: ${variation.variationSeed}`,
    `Hook style target: ${variation.hookStyle}`,
    `Persuasion angle target: ${variation.persuasionAngle}`,
    `Tone twist target: ${variation.toneTwist}`,
    categoryLine,
    serviceLine,
    packageLine,
    "",
    "Requirements:",
    "- Write 11-16 lines and at least 95 words.",
    "- First line must be a catchy hook question or statement.",
    "- Mention the season/occasion implied by the sale title in a natural way.",
    "- Use selected service categories to shape vocabulary, benefits, and hook angle.",
    ...(isNonDiscountAction(input)
      ? ["- Focus on lifestyle appeal, service quality, and booking convenience. Do NOT mention discounts, sales, percentages off, or price reductions."]
      : ["- Include concrete benefits and a clear limited-time nudge."]),
    "- If services/packages are present, include 3-6 short bullet-style lines.",
    "- Add a warm invitation line (bestie/partner/family angle is okay when relevant).",
    "- Add a clear CTA to book through ServiceFlow.",
    "- Use at most 2 emojis in the whole caption (0 is acceptable).",
    "- Keep spacing clean: add blank lines between hook, body, bullet list, and CTA.",
    "- Avoid dense paragraph blocks. Keep one main idea per line.",
    "- Keep tone local, relatable, and not scripted.",
    "- Avoid repeating generic work-stress intros. Use varied hook styles.",
    "- Mention the sale title at most twice, and never on two consecutive lines — vary the wording so it does not feel repeated.",
    "- NEVER imply the business is slow, struggling, has empty slots due to low demand, or is having a hard time getting customers. NEVER use phrases like \"quiet hours\", \"slow hours\", \"dead hours\", \"off-peak\", \"fill the window\", or \"rescue\".",
    '- Never output internal reasoning/meta lines like "Focused categories:" or "based on your ... promo."',
    '- Never include operational lines like "window is active", "15/30 behavior", or confidence/impact scoring.',
    "- Avoid fake urgency, medical claims, or spammy wording.",
    "- Hashtags should be 5-10 items, all start with # and have no spaces.",
  ].join("\n");
}

function buildGeminiRewritePrompt(input: CaptionGenerationInput, caption: string) {
  const season = inferSeasonSignal(input);
  const variation = buildCaptionPromptVariation();
  const publicSaleDescription = sanitizeSaleDescriptionForPublic(input.saleDescription);
  const categories = dedupeCategories(input.serviceCategories);
  const categoryLine = categories.length
    ? `Service categories (selected): ${categories.join(", ")}`
    : "Service categories (selected): none listed";
  const saleTitle = sanitizeSaleTitleForPublic(input.saleTitle);
  return [
    "Rewrite this caption because the previous output is too short or incomplete.",
    "Keep the same offer details, but make it complete, persuasive, and natural in Taglish.",
    "Use the sale title as the primary source of campaign context and season cues.",
    "Return valid JSON only:",
    '{"caption":"string","hashtags":["#TagOne","#TagTwo"]}',
    "",
    `Business: ${input.businessName}`,
    `Sale title (primary context source): ${saleTitle}`,
    `Sale description: ${publicSaleDescription || "N/A"}`,
    `${season.seasonLine}`,
    `Creative variation seed: ${variation.variationSeed}`,
    `Hook style target: ${variation.hookStyle}`,
    `Persuasion angle target: ${variation.persuasionAngle}`,
    `Tone twist target: ${variation.toneTwist}`,
    categoryLine,
    `Existing caption: ${caption}`,
    "",
    "Rewrite rules:",
    "- 11-16 lines and at least 95 words.",
    "- Include a hook, value section, and clear CTA.",
    "- Explicitly mention the season/occasion suggested by the sale title.",
    "- Use selected service categories to make the message specific and not generic.",
    "- Include bullet lines when services/packages are relevant.",
    "- Use at most 2 emojis in the whole caption (0 is acceptable).",
    "- Keep spacing clean: add blank lines between hook, body, bullet list, and CTA.",
    "- Avoid dense paragraph blocks. Keep one main idea per line.",
    "- Avoid repeating generic work-stress intros. Use a fresh hook.",
    "- Mention the sale title at most twice, never on two consecutive lines.",
    "- NEVER imply the business is slow, struggling, has low demand, or is having a hard time getting customers. NEVER use \"quiet hours\", \"slow hours\", \"dead hours\", \"off-peak\", \"fill window\", or \"rescue\".",
    '- Never include operational lines like "window is active", "15/30 behavior", or scoring hints.',
    "- Sound human, local, and warm.",
    '- Do not include internal/meta phrases like "Focused categories:" or "based on your ... promo."',
  ].join("\n");
}

function replaceFirstReadableLine(caption: string, nextLine: string) {
  const lines = caption.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index]?.trim() || "";
    if (!current) continue;
    if (isBulletLine(current)) continue;
    if (isServiceFlowEndingLine(current)) continue;
    lines[index] = nextLine;
    break;
  }
  return formatCaptionForSocialFeed(lines.join("\n"));
}

const STYLE_HOOKS: Record<SocialCaptionStyle, string[]> = {
  INFORMATIVE: [
    "Planning your next self-care day? This promo is a great time to book.",
    "Want a fresh look this week? Grab this limited offer while slots are open.",
  ],
  FUNNY_LIGHT: [
    "Main character energy, pero practical pa rin. Tara.",
    "Glow-up mood activated. Hindi na kailangan i-delay.",
  ],
  URGENCY_DRIVEN: [
    "Limited promo slots this week, so reserve early to get your preferred time.",
    "Best schedules go fast during this promo, so book before your ideal slot is gone.",
  ],
  PREMIUM_TONE: [
    "A curated self-care experience for clients who choose quality first.",
    "Premium treatment energy with a limited-time offer worth booking now.",
  ],
  QUESTION_ENGAGEMENT: [
    "Quick reset or full glow-up? Which one fits your vibe today?",
    "Daytime slot or after-work slot, ano ang preferred mo?",
  ],
};

const STYLE_CTA_OPTIONS: Record<SocialCaptionStyle, string[]> = {
  INFORMATIVE: [
    "Book now through ServiceFlow and claim your spot today.",
    "Message us now and we'll help you choose the best slot.",
  ],
  FUNNY_LIGHT: [
    "DM us and we'll lock your best schedule.",
    "Book now through ServiceFlow before slots fill up.",
  ],
  URGENCY_DRIVEN: [
    "Reserve now through ServiceFlow before this promo ends.",
    "Send us a quick DM to secure your preferred time.",
  ],
  PREMIUM_TONE: [
    "Book now via ServiceFlow for a premium schedule slot.",
    "Message us for your preferred treatment timing.",
  ],
  QUESTION_ENGAGEMENT: [
    "Comment your preferred slot then book via ServiceFlow.",
    "DM us your target time and we'll line it up for you.",
  ],
};

export async function generateSocialCaptionVariants(
  input: CaptionGenerationInput,
): Promise<SocialCaptionVariant[]> {
  const base = await generateSocialCaptionDraft(input);
  const overlay = sanitizeSaleTitleForPublic(input.saleTitle).toUpperCase().slice(0, 40);

  return STYLE_ORDER.map((style) => {
    const hook = pickRandom(STYLE_HOOKS[style]);
    const caption = replaceFirstReadableLine(base.caption, hook);
    return {
      style,
      caption: finalizeCaptionOutput(
        {
          caption,
          hashtags: base.hashtags,
        },
        input,
      ).caption,
      hashtags: base.hashtags,
      ctaOptions: STYLE_CTA_OPTIONS[style],
      overlaySuggestion: overlay,
    };
  });
}

function parseGeminiCaptionJson(text: string) {
  const normalized = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const candidates = [normalized];
  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(normalized.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        caption?: unknown;
        hashtags?: unknown;
      };
      if (typeof parsed.caption !== "string") {
        continue;
      }

      const hashtags = Array.isArray(parsed.hashtags)
        ? uniqueHashtags(
            parsed.hashtags.filter(
              (value): value is string => typeof value === "string",
            ),
          )
        : [];

      return {
        caption: parsed.caption.trim(),
        hashtags,
      };
    } catch {
      continue;
    }
  }

  return null;
}

function extractCaptionFromJsonishText(text: string) {
  const normalized = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const quotedMatch = normalized.match(
    /"caption"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"hashtags"|"\s*}|$)/i,
  );
  if (quotedMatch?.[1]) {
    return quotedMatch[1].replace(/\\"/g, '"').trim();
  }

  const plainMatch = normalized.match(/caption\s*:\s*([\s\S]+)/i);
  if (!plainMatch?.[1]) {
    return null;
  }

  const cleaned = plainMatch[1]
    .split(/\n\s*hashtags\s*:/i)[0]
    .replace(/[{}]/g, "")
    .replace(/^"+|"+$/g, "")
    .trim();

  return cleaned || null;
}

function parseCaptionCandidate(responseText: string, fallbackHashtags: string[]) {
  const parsed = parseGeminiCaptionJson(responseText);
  if (parsed?.caption) {
    return {
      caption: formatCaptionForSocialFeed(cleanCaptionText(parsed.caption)),
      hashtags: parsed.hashtags.length > 0 ? parsed.hashtags : fallbackHashtags,
    };
  }

  const jsonishCaption = extractCaptionFromJsonishText(responseText);
  if (jsonishCaption) {
    const hashtags = extractHashtagsFromText(responseText);
    return {
      caption: formatCaptionForSocialFeed(cleanCaptionText(jsonishCaption)),
      hashtags: hashtags.length > 0 ? hashtags : fallbackHashtags,
    };
  }

  const plainText = responseText.trim();
  if (!plainText) {
    return null;
  }

  const hashtags = extractHashtagsFromText(plainText);
  return {
    caption: formatCaptionForSocialFeed(cleanCaptionText(plainText)),
    hashtags: hashtags.length > 0 ? hashtags : fallbackHashtags,
  };
}

export type OrganicPostCategory =
  | "SERVICE_SHOWCASE"
  | "BEHIND_THE_SCENES"
  | "TIPS_EDUCATION"
  | "SEASONAL_GREETING"
  | "TEAM_SPOTLIGHT"
  | "GENERAL";

export type OrganicCaptionInput = {
  businessSlug: string;
  businessName: string;
  businessDescription?: string | null;
  topic: string;
  category: OrganicPostCategory;
  serviceNames?: string[];
  mood?: string;
  visualFocus?: string;
  ownerContext?: string;
  /**
   * Owner-selected caption tone. Same enum as the campaign-side input —
   * lets ad-hoc organic posts have the same level of voice control as
   * sale-driven ones. AUTO defers to the existing default voice.
   */
  captionTone?: CaptionGenerationInput["captionTone"];
  /**
   * Free-text owner direction for the caption specifically. Unlike
   * ownerContext (which is shared between caption and image upstream), this
   * goes only into the caption prompt. Lets owners say things like "lean
   * into team appreciation" without affecting the image direction.
   */
  ownerCaptionDirection?: string;
};

const ORGANIC_CATEGORY_INSTRUCTIONS: Record<OrganicPostCategory, string> = {
  SERVICE_SHOWCASE: "Highlight the service quality, benefits, and what makes this treatment special. Focus on the client experience and outcome.",
  BEHIND_THE_SCENES: "Give followers a warm, authentic peek behind the scenes. Highlight the team's passion, the preparation, and the care put into every client visit.",
  TIPS_EDUCATION: "Share practical beauty, wellness, or self-care tips. Be informative, relatable, and position the business as a trusted expert.",
  SEASONAL_GREETING: "Create a warm seasonal or holiday greeting that connects the occasion with self-care or a visit to the business. Feel genuine, not salesy.",
  TEAM_SPOTLIGHT: "Celebrate the team or a specific skill. Make followers feel the warmth and professionalism of the staff.",
  GENERAL: "Engage the audience with a warm, conversational post that builds community and encourages interaction.",
};

/**
 * Per-category instructions for the organic Gemini prompt. These are
 * structural (where the tip goes, how the post is shaped) rather than
 * the more general "what kind of voice" guidance which lives in the
 * category description string above.
 */
function buildOrganicCategoryInstructions(
  category: OrganicPostCategory,
): string[] {
  switch (category) {
    case "TIPS_EDUCATION":
      return [
        "- Lead with the tip itself in the first 1–2 lines. The reader should learn something before reading anything else.",
        "- Follow with 2–3 supporting bullet points (use • or -). Each bullet is one practical takeaway.",
        "- End with ONE soft, non-pushy invitation to chat or book if the topic is relevant to a service.",
        "- DO NOT pivot to a booking pitch. DO NOT say 'limited-time'. The post must teach first.",
      ];
    case "BEHIND_THE_SCENES":
      return [
        "- Open with a moment, not an offer. Describe what's happening behind the scenes.",
        "- Use storytelling voice — sensory details, small touches, the human side of preparation.",
        "- Mention the team naturally; do not turn it into a service ad.",
        "- End with one warm sentence that ties back to the visit experience, no pressure.",
      ];
    case "SEASONAL_GREETING":
      return [
        "- Lead with the seasonal or holiday acknowledgment in the first line.",
        "- Connect it briefly (1–2 lines) to self-care, rest, or a slow moment.",
        "- Tone is warm and human. NEVER transactional. NEVER 'book now'.",
        "- One soft sign-off line from the business is the only mention of the brand.",
      ];
    case "TEAM_SPOTLIGHT":
      return [
        "- Celebrate a specific aspect of the team or one person's craft.",
        "- Concrete details: how long they've been doing this, what they specialize in, what clients say.",
        "- Make readers feel the skill and care, not the price list.",
      ];
    case "SERVICE_SHOWCASE":
      return [
        "- Lead with what the experience FEELS like — sensations, outcomes, the room.",
        "- 2–4 bullet-style lines on what's included or how it goes.",
        "- One clear, friendly invitation to book at the end. Avoid hard urgency.",
      ];
    case "GENERAL":
    default:
      return [
        "- Conversational and warm — like a quick check-in with the community.",
        "- Invite a small interaction (a comment, a share) without making it a marketing ask.",
      ];
  }
}

function buildOrganicGeminiPrompt(input: OrganicCaptionInput): string {
  const toneOverride =
    input.captionTone && input.captionTone !== "AUTO"
      ? TONE_GUIDE[input.captionTone]
      : "";
  const categoryInstruction = ORGANIC_CATEGORY_INSTRUCTIONS[input.category];
  const ownerDirection = input.ownerCaptionDirection?.trim();
  const moodLine = input.mood ? `Mood/vibe: ${input.mood}.` : "";
  const focusLine = input.visualFocus ? `Visual focus: ${input.visualFocus}.` : "";
  const ownerContextLine = input.ownerContext
    ? `Additional context from the owner: ${input.ownerContext}`
    : "";

  return [
    "Write a high-quality social media caption for a Filipino audience.",
    toneOverride || "Voice: warm, natural, human — never salesy.",
    "Language: Taglish (Filipino + English), conversational like talking to a friend.",
    "",
    "This is an ORGANIC post — NOT a sale or promotion.",
    "Hard rules:",
    "  - DO NOT write 'limited-time', 'book now', 'preferred times fill up first', 'slots fill fast', or any similar pressure language.",
    "  - DO NOT mention discounts, percentages off, price reductions, or promo codes.",
    "  - DO NOT pivot to a sale even if the topic touches on a service.",
    "  - The goal is to inform, share, and connect — not to convert.",
    "",
    `Post type: ${input.category.replaceAll("_", " ").toLowerCase()}`,
    `Category guidance: ${categoryInstruction}`,
    `Topic (primary subject — base the post around this): ${input.topic}`,
    `Business: ${input.businessName}`,
    `Business description: ${input.businessDescription?.trim() || "N/A"}`,
    moodLine,
    focusLine,
    ownerContextLine,
    ownerDirection
      ? `Owner's voice direction (treat as a soft requirement, not a literal quote): ${ownerDirection}`
      : "",
    "",
    "Output format:",
    "Prefer valid JSON with this exact shape:",
    '{"caption":"string","hashtags":["#TagOne","#TagTwo"]}',
    "No markdown code fences and no extra keys.",
    "If JSON is not possible, return plain text caption only.",
    "",
    "Per-category requirements:",
    ...buildOrganicCategoryInstructions(input.category),
    "",
    "Universal requirements:",
    "- Write 8–14 lines and at least 70 words.",
    "- Use clear line breaks. One main idea per line.",
    "- The topic must appear naturally in the caption body — never as a hard heading or label.",
    "- Tie back to the business at most ONCE, softly, and only when it fits the category.",
    "- 0–2 emojis total. 0 is acceptable.",
    "- NEVER imply the business is slow or struggling. NEVER use 'quiet hours', 'slow hours', 'fill the window', 'rescue'.",
    "- NEVER output internal reasoning lines like 'Focused categories:' or 'based on your ... promo.'",
    "- 5–8 hashtags. All start with # and have no spaces.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Synthesize a minimal CaptionGenerationInput so the existing
 * finalizeCaptionOutput / buildFallbackHashtags helpers can be reused
 * without leaking sale-event fields. Only the fields those helpers
 * actually read are populated.
 */
function adaptOrganicInputForFinalize(
  input: OrganicCaptionInput,
): CaptionGenerationInput {
  const today = new Date();
  return {
    businessSlug: input.businessSlug,
    businessName: input.businessName,
    businessDescription: input.businessDescription,
    saleTitle: input.topic,
    saleDescription: null,
    startDate: today,
    endDate: today,
    serviceNames: input.serviceNames ?? [],
    actionCategory: "SOCIAL_ONLY",
    captionTone: input.captionTone,
    ownerCaptionDirection: input.ownerCaptionDirection,
  };
}

export async function generateOrganicCaptionDraft(
  input: OrganicCaptionInput,
): Promise<CaptionGenerationOutput> {
  const adapted = adaptOrganicInputForFinalize(input);
  const rescue = finalizeCaptionOutput(
    buildOrganicRescueCaption({
      category: input.category,
      topic: input.topic,
      businessName: input.businessName,
      businessSlug: input.businessSlug,
      ownerCaptionDirection: input.ownerCaptionDirection,
    }),
    adapted,
  );

  if (!isGeminiConfigured()) {
    return rescue;
  }

  const model = process.env.GEMINI_CAPTION_MODEL || "gemini-3-flash-preview";

  try {
    const responseText = await generateGeminiText({
      model,
      prompt: buildOrganicGeminiPrompt(input),
      responseMimeType: "application/json",
      temperature: 1,
      maxOutputTokens: 1200,
    });

    const candidate = parseCaptionCandidate(responseText, rescue.hashtags);
    if (!candidate) {
      return rescue;
    }

    if (!isLowQualityCaption(candidate.caption)) {
      return finalizeCaptionOutput(candidate, adapted);
    }

    // Low-quality output — return rescue rather than rewriting via the
    // sale-event rewrite prompt (which would push it back toward
    // promo voice). We accept that organic posts get one shot at AI
    // and fall back to the category rescue otherwise.
    return rescue;
  } catch {
    return rescue;
  }
}

export async function generateSocialCaptionDraft(
  input: CaptionGenerationInput,
): Promise<CaptionGenerationOutput> {
  const rescue = finalizeCaptionOutput(
    input.customRescueBuilder
      ? input.customRescueBuilder(input)
      : buildRescueCaptionDraft(input),
    input,
  );

  if (!isGeminiConfigured()) {
    return rescue;
  }

  const dateWindow = formatDateWindow(input.startDate, input.endDate);
  const model = process.env.GEMINI_CAPTION_MODEL || "gemini-3-flash-preview";

  try {
    const responseText = await generateGeminiText({
      model,
      prompt: buildGeminiPrompt(input, dateWindow),
      responseMimeType: "application/json",
      temperature: 1,
      maxOutputTokens: 1200,
    });

    const candidate = parseCaptionCandidate(responseText, rescue.hashtags);
    if (!candidate) {
      return rescue;
    }

    if (!isLowQualityCaption(candidate.caption)) {
      return finalizeCaptionOutput(candidate, input);
    }

    if (input.allowRewritePass === false) {
      return finalizeCaptionOutput(candidate, input);
    }

    logger.warn("[Social] Caption quality gate triggered. Running rewrite pass.", {
      wordCount: countWords(candidate.caption),
      lineCount: countNonEmptyLines(candidate.caption),
    });

    const rewrittenText = await generateGeminiText({
      model,
      prompt: buildGeminiRewritePrompt(input, candidate.caption),
      responseMimeType: "application/json",
      temperature: 1,
      maxOutputTokens: 1200,
    });

    const rewritten = parseCaptionCandidate(rewrittenText, candidate.hashtags);
    if (!rewritten) {
      return rescue;
    }

    if (!isLowQualityCaption(rewritten.caption)) {
      return finalizeCaptionOutput(rewritten, input);
    }

    return rescue;
  } catch (error) {
    logger.warn("[Social] Falling back to rescue caption generation", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return rescue;
  }
}
