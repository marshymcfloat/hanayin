export const DEFAULT_GROWTH_TONE_PROFILE = "taglish-natural";

export const GROWTH_TONE_PROFILE_OPTIONS = [
  { value: "taglish-natural", label: "Taglish Natural" },
  { value: "taglish-premium", label: "Taglish Premium" },
  { value: "professional-warm", label: "Professional Warm" },
  { value: "clinical-trust", label: "Clinical Trust" },
  { value: "playful-social", label: "Playful Social" },
] as const;

export type GrowthToneProfileValue = (typeof GROWTH_TONE_PROFILE_OPTIONS)[number]["value"];

export function normalizeGrowthToneProfile(value: string | null | undefined): GrowthToneProfileValue {
  const normalized = (value || "").trim();
  const isKnown = GROWTH_TONE_PROFILE_OPTIONS.some((entry) => entry.value === normalized);
  return isKnown
    ? (normalized as GrowthToneProfileValue)
    : DEFAULT_GROWTH_TONE_PROFILE;
}
