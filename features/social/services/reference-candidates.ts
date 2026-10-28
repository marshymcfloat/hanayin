import "server-only";
import { createHash } from "node:crypto";
import { put, del } from "@vercel/blob";
import { prisma } from "@/prisma/prisma";
import type { OwnerActorContext } from "@/lib/auth/owner-access";
import type { AddReferenceLink, ApproveReferenceCandidate, SuggestReferenceCandidates } from "@/features/social/reference-candidate-schemas";
import { assertReferenceCandidateOwner, ReferenceCandidateError, referenceCandidateFailure } from "@/features/social/reference-candidate-access";
import { discoverPexelsReferences, downloadReferenceCandidateImage } from "@/features/social/services/reference-candidate-provider";

const options = { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 } as const;
const duplicateError = "A visually identical file has already been approved.";
const changedError = "Candidate changed. Refresh and try again.";
export async function suggestReferenceCandidates(actor: OwnerActorContext, input: SuggestReferenceCandidates) {
  try {
    await assertReferenceCandidateOwner(prisma, actor);
    if (!["NAILS", "SKIN", "FACIAL", "SPA", "EYELASH"].includes(input.serviceCategory)) throw new ReferenceCandidateError("Unsupported Beautyfeel service category.");
    const photos = await discoverPexelsReferences(input);
    return await prisma.$transaction(async tx => {
      await assertReferenceCandidateOwner(tx, actor);
      for (const photo of photos) {
        const candidate = { business_id: actor.businessId, provider: "PEXELS", provider_id: String(photo.id), source_url: photo.url, preview_url: photo.src.large2x ?? photo.src.large ?? photo.src.medium, creator_name: photo.photographer, attribution: `Photo by ${photo.photographer} on Pexels`, license_status: "PEXELS_LICENSE_REVIEW_REQUIRED", service_category: input.serviceCategory, mood_tags: input.moodTags, quality_score: Math.min(5, 3.5 + Math.min(photo.width, photo.height) / 4000), link_only: false };
        await tx.referenceCandidate.upsert({ where: { business_id_provider_source_url: { business_id: actor.businessId, provider: "PEXELS", source_url: photo.url } }, create: candidate, update: { preview_url: candidate.preview_url, mood_tags: input.moodTags, quality_score: candidate.quality_score } });
      }
      return { success: true as const, data: await tx.referenceCandidate.findMany({ where: { business_id: actor.businessId, status: "PENDING", service_category: input.serviceCategory }, orderBy: [{ quality_score: "desc" }, { created_at: "desc" }] }) };
    }, options);
  } catch (error) { return referenceCandidateFailure(error); }
}
export async function addReferenceLink(actor: OwnerActorContext, input: AddReferenceLink) {
  try {
    return await prisma.$transaction(async tx => {
      await assertReferenceCandidateOwner(tx, actor);
      const url = new URL(input.sourceUrl);
      const provider = /(^|\.)pinterest\./i.test(url.hostname) || /(^|\.)pin\.it$/i.test(url.hostname) ? "PINTEREST" : "WEB_LINK";
      const data = await tx.referenceCandidate.upsert({ where: { business_id_provider_source_url: { business_id: actor.businessId, provider, source_url: url.toString() } }, create: { business_id: actor.businessId, provider, source_url: url.toString(), license_status: "UNVERIFIED_LINK_ONLY", service_category: input.serviceCategory, mood_tags: input.moodTags, link_only: true }, update: { mood_tags: input.moodTags } });
      return { success: true as const, data };
    }, options);
  } catch (error) { return referenceCandidateFailure(error); }
}
function ownUploadedBlob(blob: { url: string; pathname: string }, expectedPath: string) {
  try {
    const url = new URL(blob.url); const stem = expectedPath.slice(0, -4);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname.endsWith(".public.blob.vercel-storage.com") && blob.pathname.startsWith(`${stem}-`) && blob.pathname.endsWith(".jpg") && decodeURIComponent(url.pathname) === `/${blob.pathname}`;
  } catch { return false; }
}
export async function approveReferenceCandidate(actor: OwnerActorContext, input: ApproveReferenceCandidate) {
  let uploaded: { url: string; pathname: string } | undefined;
  try {
    await assertReferenceCandidateOwner(prisma, actor);
    if (!input.rightsConfirmed) throw new ReferenceCandidateError("Confirm usage rights before approval.");
    const candidate = await prisma.referenceCandidate.findFirst({ where: { id: input.candidateId, business_id: actor.businessId, status: "PENDING" } });
    if (!candidate) throw new ReferenceCandidateError("Pending candidate not found.");
    if (candidate.link_only || !candidate.preview_url) throw new ReferenceCandidateError("Link-only candidates cannot be imported until an owned or licensed file is supplied.");
    if (candidate.provider !== "PEXELS") throw new ReferenceCandidateError("Candidate image URL is not trusted.");
    const { bytes, contentType } = await downloadReferenceCandidateImage(candidate.preview_url);
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const duplicateWhere = { business_id: actor.businessId, content_hash: contentHash, status: "APPROVED" } as const;
    if (await prisma.referenceCandidate.findFirst({ where: duplicateWhere })) throw new ReferenceCandidateError(duplicateError);
    const expectedPath = `brand-assets/${actor.businessSlug}/references/${candidate.id}.jpg`;
    const blob = await put(expectedPath, bytes, { access: "public", contentType, addRandomSuffix: true });
    if (!ownUploadedBlob(blob, expectedPath)) throw new ReferenceCandidateError("Reference asset upload failed.");
    uploaded = blob;
    const data = await prisma.$transaction(async tx => {
      await assertReferenceCandidateOwner(tx, actor);
      const scope = { id: candidate.id, business_id: actor.businessId, status: "PENDING", updated_at: candidate.updated_at, preview_url: candidate.preview_url, provider: "PEXELS", link_only: false } as const;
      const current = await tx.referenceCandidate.findFirst({ where: scope });
      if (!current) throw new ReferenceCandidateError(changedError);
      if (await tx.referenceCandidate.findFirst({ where: duplicateWhere })) throw new ReferenceCandidateError(duplicateError);
      const created = await tx.brandAsset.create({ data: { business_id: actor.businessId, kind: "REFERENCE", reference_subject: "STYLE", url: blob.url, storage_key: blob.pathname, alt: `${current.service_category} ${current.mood_tags.join(" ")} reference`, uploaded_by_user_id: actor.userId } });
      const changed = await tx.referenceCandidate.updateMany({ where: scope, data: { status: "APPROVED", approved_asset_id: created.id, content_hash: contentHash, license_status: "RIGHTS_CONFIRMED_BY_DEVELOPER" } });
      if (changed.count !== 1) throw new ReferenceCandidateError(changedError);
      return created;
    }, options);
    return { success: true as const, data };
  } catch (error) {
    if (uploaded) { try { if (!await prisma.brandAsset.findFirst({ where: { business_id: actor.businessId, url: uploaded.url, storage_key: uploaded.pathname }, select: { id: true } })) await del(uploaded.url); } catch { /* Uncertain persistence or failed cleanup must not delete unrelated artifacts. */ } }
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return referenceCandidateFailure(new ReferenceCandidateError(changedError));
    return referenceCandidateFailure(error);
  }
}
export async function rejectReferenceCandidate(actor: OwnerActorContext, candidateId: string) {
  try {
    return await prisma.$transaction(async tx => {
      await assertReferenceCandidateOwner(tx, actor);
      await tx.referenceCandidate.updateMany({ where: { id: candidateId, business_id: actor.businessId, status: "PENDING" }, data: { status: "REJECTED" } });
      return { success: true as const };
    }, options);
  } catch (error) { return referenceCandidateFailure(error); }
}
