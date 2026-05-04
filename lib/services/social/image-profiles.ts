export const SOCIAL_IMAGE_PROFILES = [
  "PHOTO_REALISTIC",
  "SOFT_EDITORIAL",
  "MODERN_GRAPHIC",
  "BOLD_MONOCHROME",
  "WARM_EDITORIAL",
  "EDUCATIONAL",
] as const;

export type SocialImageProfile = (typeof SOCIAL_IMAGE_PROFILES)[number];

export const DEFAULT_SOCIAL_IMAGE_PROFILE: SocialImageProfile =
  "SOFT_EDITORIAL";

export const SOCIAL_IMAGE_PROFILE_OPTIONS: Array<{
  value: SocialImageProfile;
  label: string;
  description: string;
}> = [
  {
    value: "SOFT_EDITORIAL",
    label: "Soft Editorial",
    description:
      "Clean spa aesthetic, premium whites, magazine-style composition. A safe, classy default.",
  },
  {
    value: "PHOTO_REALISTIC",
    label: "Realistic Photo",
    description:
      "Natural people, true-to-life lighting, lifestyle vibe. Best when you want authenticity.",
  },
  {
    value: "WARM_EDITORIAL",
    label: "Warm Luxury Editorial",
    description:
      "Golden-hour warmth, caramel tones, dewy-skin macro. Beauty editorial energy.",
  },
  {
    value: "MODERN_GRAPHIC",
    label: "Modern Graphic",
    description:
      "Bold colors and crisp shapes. Punchy on the feed. Image is graphic but contains no text.",
  },
  {
    value: "BOLD_MONOCHROME",
    label: "Bold Monochrome",
    description:
      "Cinematic black and white, dramatic light, single confident subject.",
  },
  {
    value: "EDUCATIONAL",
    label: "Educational Tip Card",
    description:
      "Calm flat-lay backdrop with generous negative space — designed to anchor a headline overlay. Best for tips & education posts.",
  },
];

export function isSocialImageProfile(value: string): value is SocialImageProfile {
  return (SOCIAL_IMAGE_PROFILES as readonly string[]).includes(value);
}
