import { buildImagePromptGeneratorPrompt } from "@/lib/services/growth/prompts";
import type {
  GeneratedOffer,
  ImagePromptStyle,
  ImagePromptVariant,
} from "@/lib/services/growth/types";
import { generateGrowthJson } from "@/lib/services/growth/llm-client";

const STYLE_ORDER: ImagePromptStyle[] = [
  "CLEAN_EDITORIAL",
  "LUXE_STUDIO",
  "PLAYFUL_SOCIAL",
];

function fallbackPrompt(input: {
  style: ImagePromptStyle;
  businessName: string;
  offer: GeneratedOffer;
}): ImagePromptVariant {
  const shared = `Promo visual for ${input.businessName}, headline "${input.offer.title}", include readable text hierarchy, no logos, no watermarks, premium beauty/wellness mood, facebook/instagram feed composition.`;
  const byStyle: Record<ImagePromptStyle, string> = {
    CLEAN_EDITORIAL: `${shared} Style: minimal editorial, airy lighting, neutral palette, clean typography.`,
    LUXE_STUDIO: `${shared} Style: luxury studio aesthetic, controlled shadows, elegant serif accents, polished skin tones.`,
    PLAYFUL_SOCIAL: `${shared} Style: vibrant but tasteful social card, energetic layout, rounded shapes, high readability.`,
  };

  return {
    style: input.style,
    prompt: byStyle[input.style],
    overlaySuggestion: input.offer.title.toUpperCase().slice(0, 28),
  };
}

export async function generateImagePromptVariants(input: {
  businessName: string;
  businessType: string;
  offer: GeneratedOffer;
  captionHooks: string[];
  skipLlm?: boolean;
}): Promise<ImagePromptVariant[]> {
  if (input.skipLlm) {
    return STYLE_ORDER.map((style) =>
      fallbackPrompt({
        style,
        businessName: input.businessName,
        offer: input.offer,
      }),
    );
  }

  const prompt = buildImagePromptGeneratorPrompt(input);
  const llm = await generateGrowthJson<{
    prompts?: Array<{
      style?: ImagePromptStyle;
      prompt?: string;
      overlaySuggestion?: string;
    }>;
  }>({
    prompt,
    modelEnvVar: "GEMINI_CAPTION_MODEL",
    fallbackModel: "gemini-3-flash-preview",
  });

  const llmPrompts = llm?.prompts
    ?.filter((entry) => entry.style && entry.prompt)
    .map((entry) => ({
      style: entry.style as ImagePromptStyle,
      prompt: (entry.prompt || "").trim(),
      overlaySuggestion: (entry.overlaySuggestion || input.offer.title).slice(0, 40),
    }))
    .filter((entry) => STYLE_ORDER.includes(entry.style));

  if (llmPrompts && llmPrompts.length >= 3) {
    return STYLE_ORDER.map(
      (style) => llmPrompts.find((entry) => entry.style === style) || fallbackPrompt({ style, businessName: input.businessName, offer: input.offer }),
    );
  }

  return STYLE_ORDER.map((style) =>
    fallbackPrompt({
      style,
      businessName: input.businessName,
      offer: input.offer,
    }),
  );
}
