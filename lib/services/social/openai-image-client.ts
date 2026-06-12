import { logger } from "@/lib/logger";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const DEFAULT_OPENAI_IMAGE_TIMEOUT_MS = 60_000;

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
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "auto"
  ) {
    return value;
  }
  return "high";
}

function resolveTimeoutMs() {
  const value = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_OPENAI_IMAGE_TIMEOUT_MS;
  }
  return Math.floor(value);
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

function mimeTypeToExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

async function fetchImageFromUrl(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `OpenAI image URL fetch failed with status ${response.status}`,
    );
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
  const timeoutMs = resolveTimeoutMs();

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(OPENAI_IMAGES_URL, {
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
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `OpenAI image generation timed out after ${timeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  const payload = (await response.json()) as OpenAIImagesResponse;

  if (!response.ok || payload.error) {
    const message =
      payload.error?.message ||
      `OpenAI image generation failed with status ${response.status}`;
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
    // Use a fresh, smaller timeout for the follow-up download.
    const downloadController = new AbortController();
    const downloadTimer = setTimeout(
      () => downloadController.abort(),
      Math.min(timeoutMs, 30_000),
    );
    try {
      return await fetchImageFromUrl(image.url, downloadController.signal);
    } finally {
      clearTimeout(downloadTimer);
    }
  }

  throw new Error("OpenAI image response did not include image bytes or URL");
}

/**
 * Image-to-image via the OpenAI edits endpoint. Unlike /generations, this
 * accepts an input image (the reference) and conditions the result on it,
 * which is what makes reference-based generation work on the OpenAI path.
 * gpt-image-1 returns b64_json directly.
 */
export async function editOpenAIImage(input: {
  prompt: string;
  image: { bytes: Buffer; mimeType: string };
}) {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    throw new Error("OPENAI_KEY is not configured");
  }

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const outputFormat = resolveOutputFormat();
  const size = resolveImageSize();
  const quality = resolveImageQuality();
  const timeoutMs = resolveTimeoutMs();

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", input.prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append("output_format", outputFormat);
  form.append("n", "1");
  const extension = mimeTypeToExtension(input.image.mimeType);
  // Buffer is a Uint8Array view; wrap as a Blob so fetch builds a proper
  // multipart body (do NOT set Content-Type manually — fetch adds the
  // boundary from the FormData).
  const fileBlob = new Blob([new Uint8Array(input.image.bytes)], {
    type: input.image.mimeType,
  });
  form.append("image", fileBlob, `reference.${extension}`);

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(OPENAI_IMAGE_EDITS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`OpenAI image edit timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  const payload = (await response.json()) as OpenAIImagesResponse;

  if (!response.ok || payload.error) {
    const message =
      payload.error?.message ||
      `OpenAI image edit failed with status ${response.status}`;
    throw new Error(message);
  }

  const image = payload.data?.[0];
  if (!image?.b64_json) {
    throw new Error("OpenAI image edit returned no image bytes");
  }

  logger.info("[Social] OpenAI image edit usage", {
    model,
    inputTokens: payload.usage?.input_tokens ?? null,
    outputTokens: payload.usage?.output_tokens ?? null,
    totalTokens: payload.usage?.total_tokens ?? null,
  });

  return {
    bytes: Buffer.from(image.b64_json, "base64"),
    mimeType: outputFormatToMimeType(outputFormat),
  };
}
