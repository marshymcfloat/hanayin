export type BeautyFeelHighlight = {
  title: string;
  description: string;
};

export type BeautyFeelPrinciple = {
  number: string;
  title: string;
  description: string;
};

export type BeautyFeelSocial = {
  label: string;
  href: string;
};

export const BEAUTY_FEEL_SLUGS = new Set(["beautyfeel", "beautyifeel"]);

/**
 * Pexels image references — large variant URLs. The host is whitelisted in
 * next.config.ts (`images.pexels.com`). Each image was hand-picked from the
 * Pexels free library and represents a real photograph (no AI generation).
 */
export const beautyFeelImages = {
  hero: "https://images.pexels.com/photos/6560308/pexels-photo-6560308.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1200&w=1600",
  skin: "https://images.pexels.com/photos/30809943/pexels-photo-30809943.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=720",
  nails: "https://images.pexels.com/photos/11124957/pexels-photo-11124957.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=720",
  lashes:
    "https://images.pexels.com/photos/36930354/pexels-photo-36930354.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=720",
  stillLife:
    "https://images.pexels.com/photos/33365012/pexels-photo-33365012.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1100&w=900",
  cta: "https://images.pexels.com/photos/1926811/pexels-photo-1926811.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1600",
  services:
    "https://images.pexels.com/photos/3847485/pexels-photo-3847485.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1600",
} as const;

export const beautyFeelContent = {
  hero: {
    eyebrow: "Puerto Princesa, Palawan · Est. studio",
    title: "Quiet beauty,\ndone with intention.",
    description:
      "A small studio for skin, nails, and lashes. Generous time, gentle hands, and treatments tuned to how you want to feel walking out.",
    primaryCta: "Book an appointment",
    secondaryCta: "View the menu",
  },
  signature: {
    eyebrow: "Three rooms, three rituals",
    items: [
      {
        category: "Skin",
        title: "Facials & lifts",
        description:
          "Barrier-first facials, gentle peels, and microcurrent. Tailored after a short consultation — never one-size-fits-all.",
        image: "skin",
      },
      {
        category: "Nails",
        title: "Manicures & pedicures",
        description:
          "Gel, hard gel, structured manicures, and a calm chair to read or scroll while we work.",
        image: "nails",
      },
      {
        category: "Lashes",
        title: "Lifts & extensions",
        description:
          "Classic, hybrid, and volume sets. Natural-looking lifts. We'll never over-style for the photo — only for how you'll wear it.",
        image: "lashes",
      },
    ],
  },
  highlights: [
    {
      title: "Skin-first formulas",
      description:
        "Thoughtfully selected products that focus on barrier care and long-lasting glow.",
    },
    {
      title: "Precision artistry",
      description:
        "Deliberate, meticulous work across nails, lash, and facial treatments.",
    },
    {
      title: "Unhurried care",
      description:
        "A calming pace with time for consultation, aftercare, and touch-ups.",
    },
  ] as BeautyFeelHighlight[],
  /**
   * Studio principles — replaces the previous (fabricated) testimonials.
   * These are operational commitments any quiet, considered studio could
   * choose to make. They're claims about how we work, not invented quotes
   * from invented customers.
   */
  principles: [
    {
      number: "01",
      title: "Single appointments. No double-booking.",
      description:
        "Your appointment time is yours. We never schedule two clients in the same chair to rush either.",
    },
    {
      number: "02",
      title: "Sanitation by hospital standard.",
      description:
        "Every tool is autoclaved between guests. New disposables for every session. No exceptions.",
    },
    {
      number: "03",
      title: "We never up-sell.",
      description:
        "The plan you arrive with is the plan you leave with. If we suggest a tweak, it's because you asked.",
    },
  ] as BeautyFeelPrinciple[],
  socials: [
    { label: "Instagram", href: "https://instagram.com/beautyfeel" },
    { label: "Facebook", href: "https://facebook.com/beautyfeel" },
    { label: "TikTok", href: "https://tiktok.com/@beautyfeel" },
  ] as BeautyFeelSocial[],
  quickFacts: [
    { label: "Avg. visit", value: "60–90 min" },
    { label: "Walk-ins", value: "Limited slots" },
    { label: "Payment", value: "Cash, QR" },
  ],
};

export const isBeautyFeelSlug = (slug: string) => BEAUTY_FEEL_SLUGS.has(slug);
