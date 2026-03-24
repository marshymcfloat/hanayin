import { logger } from "@/lib/logger";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

type OpenAIImageData = {
  b64_json?: string;
  url?: string;
};

type OpenAIImageUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type OpenAIImagesResponse = {
  data?: OpenAIImageData[];
  usage?: OpenAIImageUsage;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

type OutputFormat = "png" | "webp" | "jpeg";
type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
type ImageQuality = "low" | "medium" | "high" | "auto";

function getOpenAIKey() {
  return process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || "";
}

export function isOpenAIImageConfigured() {
  return !!getOpenAIKey();
}

function resolveOutputFormat(): OutputFormat {
  const value = process.env.OPENAI_IMAGE_OUTPUT_FORMAT;
  if (value === "png" || value === "webp" || value === "jpeg") return value;
  return "png";
}

function resolveImageSize(): ImageSize {
  const value = process.env.OPENAI_IMAGE_SIZE;
  if (
    value === "1024x1024" ||
    value === "1024x1536" ||
    value === "1536x1024" ||
    value === "auto"
  ) {
    return value;
  }
  return "1024x1536";
}

function resolveImageQuality(): ImageQuality {
  const value = process.env.OPENAI_IMAGE_QUALITY;
  if (value === "low" || value === "medium" || value === "high" || value === "auto") {
    return value;
  }
  return "high";
}

function outputFormatToMimeType(outputFormat: OutputFormat) {
  switch (outputFormat) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

async function fetchImageFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenAI image URL fetch failed with status ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, mimeType: contentType };
}

export async function generateOpenAIImage(input: { prompt: string }) {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    throw new Error("OPENAI_KEY is not configured");
  }

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const outputFormat = resolveOutputFormat();
  const size = resolveImageSize();
  const quality = resolveImageQuality();

  const response = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      size,
      quality,
      output_format: outputFormat,
      n: 1,
    }),
  });

  const payload = (await response.json()) as OpenAIImagesResponse;

  if (!response.ok || payload.error) {
    const message =
      payload.error?.message || `OpenAI image generation failed with status ${response.status}`;
    throw new Error(message);
  }

  const image = payload.data?.[0];
  if (!image) {
    throw new Error("OpenAI image generation returned no images");
  }

  logger.info("[Social] OpenAI image generation usage", {
    model,
    inputTokens: payload.usage?.input_tokens ?? null,
    outputTokens: payload.usage?.output_tokens ?? null,
    totalTokens: payload.usage?.total_tokens ?? null,
  });

  if (image.b64_json) {
    return {
      bytes: Buffer.from(image.b64_json, "base64"),
      mimeType: outputFormatToMimeType(outputFormat),
    };
  }

  if (image.url) {
    return fetchImageFromUrl(image.url);
  }

  throw new Error("OpenAI image response did not include image bytes or URL");
}
