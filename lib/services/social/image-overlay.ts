import { DiscountType } from "@/prisma/generated/prisma/enums";

export const SOCIAL_IMAGE_OVERLAY_THEMES = ["light-card", "dark-card"] as const;
export type SocialImageOverlayTheme = (typeof SOCIAL_IMAGE_OVERLAY_THEMES)[number];
export const SOCIAL_IMAGE_OVERLAY_LAYOUTS = [
  "soft-editorial",
  "clean-minimal",
  "classic-promo",
] as const;
export type SocialImageOverlayLayout = (typeof SOCIAL_IMAGE_OVERLAY_LAYOUTS)[number];
export const SOCIAL_IMAGE_CARD_SIZE_MIN = 82;
export const SOCIAL_IMAGE_CARD_SIZE_MAX = 118;
export const SOCIAL_IMAGE_CARD_SIZE_DEFAULT = 100;

export type SocialImageOverlayDraft = {
  businessName: string;
  discountLine: string;
  titleLine: string;
  dateLine: string;
  ctaLine: string;
  supportLine: string;
  theme: SocialImageOverlayTheme;
  layoutStyle?: SocialImageOverlayLayout;
  cardXPercent?: number;
  cardYPercent?: number;
  cardSizePercent?: number;
};

const DEFAULT_THEME: SocialImageOverlayTheme = "light-card";
const DEFAULT_LAYOUT_STYLE: SocialImageOverlayLayout = "soft-editorial";

const FIELD_LIMITS = {
  businessName: 60,
  discountLine: 40,
  titleLine: 80,
  dateLine: 40,
  ctaLine: 70,
  supportLine: 120,
} as const;

function normalizeText(value: string, maxLength: number) {
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function cleanCampaignTitle(value: string) {
  let cleaned = value
    .replace(/\s*\((?:draft|draft suggestion)[^)]*\)\s*$/i, "")
    .replace(/\s*\(draft[^)]*$/i, "")
    .replace(/\s*[-:|]?\s*draft(?:\s*suggestion)?\s*$/i, "")
    .trim();

  if (!cleaned) {
    cleaned = value.trim();
  }

  return cleaned.replace(/\s+/g, " ");
}

function isSocialImageOverlayLayout(value: string): value is SocialImageOverlayLayout {
  return SOCIAL_IMAGE_OVERLAY_LAYOUTS.includes(value as SocialImageOverlayLayout);
}

function clampRange(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function formatDiscount(discountType: DiscountType, discountValue: number) {
  if (discountType === "PERCENTAGE") {
    return `${Math.max(0, Math.round(discountValue))}% OFF`;
  }
  return `PHP ${Math.max(0, Math.round(discountValue)).toLocaleString("en-PH")} OFF`;
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
    return "TODAY ONLY";
  }
  const formatter = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

export function isSocialImageOverlayTheme(value: string): value is SocialImageOverlayTheme {
  return SOCIAL_IMAGE_OVERLAY_THEMES.includes(value as SocialImageOverlayTheme);
}

export function buildDefaultOverlayDraftFromPost(input: {
  businessName: string;
  title: string;
  saleDescription?: string | null;
  discountType?: DiscountType;
  discountValue?: number;
  startDate: Date;
  endDate: Date;
  actionCategory?: string;
}) {
  const hasDiscount = input.discountType && input.discountValue && input.discountValue > 0;
  const isNonDiscount = input.actionCategory === "SOCIAL_ONLY" || input.actionCategory === "AWARENESS";

  const discountLine = hasDiscount && !isNonDiscount
    ? formatDiscount(input.discountType!, input.discountValue!)
    : "";

  const ctaLine = input.actionCategory === "AWARENESS"
    ? "Follow us on ServiceFlow"
    : "Book now on ServiceFlow";

  const supportLine = isNonDiscount
    ? (input.saleDescription || input.title)
    : (input.saleDescription || "Limited-time offer");

  return sanitizeOverlayDraft({
    businessName: input.businessName,
    discountLine,
    titleLine: input.title,
    dateLine: formatDateRange(input.startDate, input.endDate),
    ctaLine,
    supportLine,
    theme: DEFAULT_THEME,
  });
}

export function sanitizeOverlayDraft(
  value: Partial<SocialImageOverlayDraft> | null | undefined,
  fallback?: SocialImageOverlayDraft,
): SocialImageOverlayDraft {
  const safeFallback = fallback || {
    businessName: "",
    discountLine: "",
    titleLine: "",
    dateLine: "",
    ctaLine: "Book now on ServiceFlow",
    supportLine: "Limited-time offer",
    theme: DEFAULT_THEME,
  };

  const theme =
    value?.theme && isSocialImageOverlayTheme(value.theme)
      ? value.theme
      : safeFallback.theme;
  const layoutStyle =
    typeof value?.layoutStyle === "string" && isSocialImageOverlayLayout(value.layoutStyle)
      ? value.layoutStyle
      : typeof safeFallback.layoutStyle === "string" &&
          isSocialImageOverlayLayout(safeFallback.layoutStyle)
        ? safeFallback.layoutStyle
        : DEFAULT_LAYOUT_STYLE;
  const cardXPercent = clampRange(
    typeof value?.cardXPercent === "number"
      ? value.cardXPercent
      : typeof safeFallback.cardXPercent === "number"
        ? safeFallback.cardXPercent
        : 6,
    0,
    100,
    6,
  );
  const cardYPercent = clampRange(
    typeof value?.cardYPercent === "number"
      ? value.cardYPercent
      : typeof safeFallback.cardYPercent === "number"
        ? safeFallback.cardYPercent
        : 4,
    0,
    100,
    4,
  );
  const cardSizePercent = clampRange(
    typeof value?.cardSizePercent === "number"
      ? value.cardSizePercent
      : typeof safeFallback.cardSizePercent === "number"
        ? safeFallback.cardSizePercent
        : SOCIAL_IMAGE_CARD_SIZE_DEFAULT,
    SOCIAL_IMAGE_CARD_SIZE_MIN,
    SOCIAL_IMAGE_CARD_SIZE_MAX,
    SOCIAL_IMAGE_CARD_SIZE_DEFAULT,
  );

  return {
    businessName: normalizeText(
      value?.businessName ?? safeFallback.businessName,
      FIELD_LIMITS.businessName,
    ),
    discountLine: normalizeText(
      value?.discountLine ?? safeFallback.discountLine,
      FIELD_LIMITS.discountLine,
    ),
    titleLine: normalizeText(
      cleanCampaignTitle(value?.titleLine ?? safeFallback.titleLine),
      FIELD_LIMITS.titleLine,
    ),
    dateLine: normalizeText(
      value?.dateLine ?? safeFallback.dateLine,
      FIELD_LIMITS.dateLine,
    ),
    ctaLine: normalizeText(
      value?.ctaLine ?? safeFallback.ctaLine,
      FIELD_LIMITS.ctaLine,
    ),
    supportLine: normalizeText(
      value?.supportLine ?? safeFallback.supportLine,
      FIELD_LIMITS.supportLine,
    ),
    theme,
    layoutStyle,
    cardXPercent,
    cardYPercent,
    cardSizePercent,
  };
}

export function parseSocialImageOverlayDraft(value: unknown): SocialImageOverlayDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const parsedTheme =
    typeof candidate.theme === "string" && isSocialImageOverlayTheme(candidate.theme)
      ? candidate.theme
      : undefined;
  const parsed = sanitizeOverlayDraft({
    businessName: typeof candidate.businessName === "string" ? candidate.businessName : "",
    discountLine: typeof candidate.discountLine === "string" ? candidate.discountLine : "",
    titleLine: typeof candidate.titleLine === "string" ? candidate.titleLine : "",
    dateLine: typeof candidate.dateLine === "string" ? candidate.dateLine : "",
    ctaLine: typeof candidate.ctaLine === "string" ? candidate.ctaLine : "",
    supportLine: typeof candidate.supportLine === "string" ? candidate.supportLine : "",
    theme: parsedTheme,
    layoutStyle:
      typeof candidate.layoutStyle === "string" &&
      isSocialImageOverlayLayout(candidate.layoutStyle)
        ? candidate.layoutStyle
        : undefined,
    cardXPercent:
      typeof candidate.cardXPercent === "number" ? candidate.cardXPercent : undefined,
    cardYPercent:
      typeof candidate.cardYPercent === "number" ? candidate.cardYPercent : undefined,
    cardSizePercent:
      typeof candidate.cardSizePercent === "number"
        ? candidate.cardSizePercent
        : undefined,
  });

  if (!parsed.titleLine && !parsed.discountLine && !parsed.businessName) {
    return null;
  }

  return parsed;
}
