import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/services/brand-assets/validation";
import { logger } from "@/lib/logger";

const FETCH_TIMEOUT_MS = 10_000;

export type ReferenceImageFetch =
  | { ok: true; data: string; mimeType: string }
  | { ok: false; error: string };

/**
 * Pull a stored reference image (a Vercel Blob public URL) back into memory
 * as base64 so it can be handed to the multimodal image models. Returns
 * base64 WITHOUT the `data:` URI prefix — that's the shape Gemini's
 * `inlineData.data` expects and the shape we wrap into an OpenAI edit Blob.
 *
 * Re-uses the same size/type budget as the upload path
 * (lib/server actions/brand-assets.ts) so we never feed the model an asset
 * the library itself would have rejected.
 */
export async function fetchReferenceImageBytes(
  url: string,
): Promise<ReferenceImageFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, error: `fetch failed with status ${res.status}` };
    }

    const mimeType = (res.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
      return { ok: false, error: `unsupported content type: ${mimeType || "unknown"}` };
    }

    // content-length is advisory (some CDNs omit it); the buffer-length
    // check below is the real guard.
    const declaredLength = Number(res.headers.get("content-length") || 0);
    if (declaredLength > MAX_UPLOAD_SIZE_BYTES) {
      return { ok: false, error: "reference image too large" };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0) {
      return { ok: false, error: "reference image was empty" };
    }
    if (buffer.byteLength > MAX_UPLOAD_SIZE_BYTES) {
      return { ok: false, error: "reference image too large" };
    }

    return { ok: true, data: buffer.toString("base64"), mimeType };
  } catch (error) {
    logger.warn("[Social] Reference image fetch failed.", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: "reference image could not be loaded" };
  } finally {
    clearTimeout(timer);
  }
}
