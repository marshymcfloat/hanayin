import { logger } from "@/lib/logger";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_TIMEOUT_MS = 12_000;

type GeminiInlineData = {
  data?: string;
  mimeType?: string;
  mime_type?: string;
};

type GeminiPart = {
  text?: string;
  inlineData?: GeminiInlineData;
  inline_data?: GeminiInlineData;
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
  };
  finishReason?: string;
};

type GeminiErrorResponse = {
  error?: {
    message?: string;
    status?: string;
  };
};

type GeminiGenerateContentResponse = GeminiErrorResponse & {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
  };
};

/**
 * Reference/input image to condition generation on. `data` is raw base64
 * (no `data:` URI prefix) — the shape `inlineData.data` expects.
 */
export type GeminiInputImage = {
  data: string;
  mimeType: string;
};

type GenerateGeminiContentInput = {
  model: string;
  prompt: string;
  images?: GeminiInputImage[];
  generationConfig?: Record<string, unknown>;
};

function getGeminiApiKey() {
  return process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || "";
}

function getGeminiRequestTimeoutMs() {
  const value = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_GEMINI_TIMEOUT_MS;
  }
  return Math.floor(value);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function isGeminiConfigured() {
  return !!getGeminiApiKey();
}

async function generateGeminiContent(input: GenerateGeminiContentInput) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_KEY is not configured");
  }

  const timeoutMs = getGeminiRequestTimeoutMs();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(
      `${GEMINI_API_BASE}/${encodeURIComponent(input.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              // Image parts first, then the text instruction — Gemini
              // conditions most reliably on "here is an image, now do X".
              parts: [
                ...(input.images ?? []).map((image) => ({
                  inlineData: {
                    data: image.data,
                    mimeType: image.mimeType,
                  },
                })),
                { text: input.prompt },
              ],
            },
          ],
          generationConfig: input.generationConfig,
        }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Gemini request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  const payload = (await response.json()) as GeminiGenerateContentResponse;

  if (!response.ok || payload.error) {
    const message =
      payload.error?.message ||
      `Gemini request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!payload.candidates?.length) {
    const blockedReason = payload.promptFeedback?.blockReason;
    if (blockedReason) {
      throw new Error(`Gemini blocked response: ${blockedReason}`);
    }
    throw new Error("Gemini did not return candidates");
  }

  return payload;
}

function extractText(payload: GeminiGenerateContentResponse) {
  const texts = (payload.candidates ?? []).flatMap((candidate) =>
    (candidate.content?.parts ?? [])
      .map((part) => part.text?.trim())
      .filter((value): value is string => !!value),
  );

  return texts.join("\n").trim();
}

function extractInlineImage(payload: GeminiGenerateContentResponse) {
  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inline = part.inlineData || part.inline_data;
      if (inline?.data) {
        return {
          data: inline.data,
          mimeType: inline.mimeType || inline.mime_type || "image/png",
        };
      }
    }
  }
  return null;
}

export async function generateGeminiText(input: {
  model: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  /**
   * Gemini 2.5+ models (flash, pro) enable "thinking" by default and the
   * thinking tokens count against maxOutputTokens. For captions we don't
   * need internal reasoning — without setting `thinkingBudget: 0` the model
   * burns most of the budget on thinking and the visible caption gets
   * truncated mid-word. Pass `disableThinking: true` (default) for caption
   * paths; set to false only for tasks where thinking actually helps.
   */
  disableThinking?: boolean;
}) {
  const disableThinking = input.disableThinking ?? true;
  const payload = await generateGeminiContent({
    model: input.model,
    prompt: input.prompt,
    generationConfig: {
      temperature: input.temperature,
      maxOutputTokens: input.maxOutputTokens,
      responseMimeType: input.responseMimeType,
      ...(disableThinking
        ? { thinkingConfig: { thinkingBudget: 0 } }
        : {}),
    },
  });

  const text = extractText(payload);
  if (!text) {
    throw new Error("Gemini returned an empty text response");
  }
  return text;
}

export async function generateGeminiImage(input: {
  model: string;
  prompt: string;
  /**
   * Optional reference/input images. When provided, Gemini conditions the
   * generated image on them (image-to-image) — this is what powers
   * reference-based generation and person identity preservation.
   */
  images?: GeminiInputImage[];
}) {
  const payload = await generateGeminiContent({
    model: input.model,
    prompt: input.prompt,
    images: input.images,
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  const inline = extractInlineImage(payload);
  if (!inline) {
    const maybeText = extractText(payload);
    logger.warn("[Social] Gemini image generation returned no image parts", {
      model: input.model,
      responseText: maybeText || null,
    });
    throw new Error("Gemini did not return image bytes");
  }

  return {
    bytes: Buffer.from(inline.data, "base64"),
    mimeType: inline.mimeType,
  };
}
