import "server-only";
import { ALLOWED_IMAGE_TYPES } from "@/lib/services/brand-assets/validation";
import { ReferenceCandidateError } from "@/features/social/reference-candidate-access";
import { pexelsReferenceResponseSchema, trustedReferenceImageUrlSchema, type SuggestReferenceCandidates } from "@/features/social/reference-candidate-schemas";

const imageLimit = 10 * 1024 * 1024;
async function readBounded(response: Response, limit: number, tooLarge: string) {
  if (Number(response.headers.get("content-length") || 0) > limit) { await response.body?.cancel().catch(() => {}); throw new ReferenceCandidateError(tooLarge); }
  if (!response.body) throw new ReferenceCandidateError("Candidate image could not be downloaded.");
  const reader = response.body.getReader(); const chunks: Buffer[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel().catch(() => {}); throw new ReferenceCandidateError(tooLarge); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  if (length === 0) throw new ReferenceCandidateError("Candidate image could not be downloaded.");
  return Buffer.concat(chunks, length);
}
export async function discoverPexelsReferences(input: SuggestReferenceCandidates) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new ReferenceCandidateError("PEXELS_API_KEY is required for licensed reference discovery.");
  const query = [`premium ${input.serviceCategory.toLowerCase()} beauty spa editorial`, ...input.moodTags].join(" ");
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://api.pexels.com/v1/search?orientation=portrait&per_page=12&query=${encodeURIComponent(query)}`, { headers: { Authorization: key }, cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal });
    if (!response.ok || response.redirected) throw new ReferenceCandidateError("Licensed reference provider is unavailable.");
    const payload = pexelsReferenceResponseSchema.safeParse(JSON.parse((await readBounded(response, 1024 * 1024, "Licensed reference provider is unavailable.")).toString("utf8")));
    if (!payload.success) throw new ReferenceCandidateError("Licensed reference provider is unavailable.");
    return payload.data.photos;
  } catch { throw new ReferenceCandidateError("Licensed reference provider is unavailable."); }
  finally { clearTimeout(timer); }
}
export async function downloadReferenceCandidateImage(previewUrl: string) {
  const validation = trustedReferenceImageUrlSchema.safeParse(previewUrl);
  if (!validation.success) throw new ReferenceCandidateError("Candidate image URL is not trusted.");
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(validation.data, { cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal });
    if (!response.ok || response.redirected || (response.url && !trustedReferenceImageUrlSchema.safeParse(response.url).success)) throw new ReferenceCandidateError("Candidate image could not be downloaded.");
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) { await response.body?.cancel().catch(() => {}); throw new ReferenceCandidateError("Candidate image type is not supported."); }
    return { bytes: await readBounded(response, imageLimit, "Candidate exceeds the 10 MB limit."), contentType };
  } catch (error) { if (error instanceof ReferenceCandidateError) throw error; throw new ReferenceCandidateError("Candidate image could not be downloaded."); }
  finally { clearTimeout(timer); }
}
