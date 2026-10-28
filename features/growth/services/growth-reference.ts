import "server-only";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_SIZE_BYTES } from "@/lib/services/brand-assets/validation";
import type { ReferenceImage } from "@/lib/services/social/promo-image";
import { getGrowthReferenceAsset, getGrowthReferenceCandidate } from "@/features/growth/queries/growth-actions";
import { isOwnedGrowthReferenceUrl } from "@/features/growth/services/growth-reference-url";
import type { GrowthOwnerActor, GrowthReferenceSource } from "@/features/growth/growth-action-types";

export async function downloadOwnedGrowthReference(url: string, storageKey: string, slug: string): Promise<{ data: string; mimeType: string } | null> {
  if (!isOwnedGrowthReferenceUrl(url, storageKey, slug)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "error", credentials: "omit" });
    if (!response.ok || response.redirected || !isOwnedGrowthReferenceUrl(response.url, storageKey, slug)) return null;
    const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (!ALLOWED_IMAGE_TYPES.has(mimeType) || !Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_UPLOAD_SIZE_BYTES || !response.body) return null;
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_UPLOAD_SIZE_BYTES) return null;
      chunks.push(chunk.value);
    }
    if (size === 0) return null;
    return { data: Buffer.concat(chunks, size).toString("base64"), mimeType };
  } catch {
    return null;
  } finally {
    controller.abort();
    clearTimeout(timer);
    if (reader) { try { await reader.cancel(); } catch { /* Unavailable references use prompt-only generation. */ } }
    if (reader) { try { reader.releaseLock(); } catch { /* The stream may already be closed. */ } }
  }
}

export async function getGrowthApprovedReference(actor: GrowthOwnerActor, categories: string[]): Promise<{ image: ReferenceImage; source: GrowthReferenceSource } | null> {
  if (actor.businessSlug !== "beautyfeel") return null;
  const candidate = await getGrowthReferenceCandidate(actor, categories);
  if (!candidate?.approved_asset_id) return null;
  const asset = await getGrowthReferenceAsset(actor, candidate.approved_asset_id);
  if (!asset?.storage_key || !isOwnedGrowthReferenceUrl(asset.url, asset.storage_key, actor.businessSlug)) return null;
  const fetched = await downloadOwnedGrowthReference(asset.url, asset.storage_key, actor.businessSlug);
  if (!fetched) return null;
  return { image: { data: fetched.data, mimeType: fetched.mimeType, subject: asset.reference_subject ?? "STYLE" }, source: { candidateId: candidate.id, candidateUpdatedAt: candidate.updated_at, assetId: asset.id, assetUpdatedAt: asset.updated_at, assetUrl: asset.url, storageKey: asset.storage_key } };
}
