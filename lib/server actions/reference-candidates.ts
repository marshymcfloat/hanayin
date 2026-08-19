"use server";

import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { prisma } from "@/prisma/prisma";

const PILOT_SLUG = "beautyfeel";
const ALLOWED_CATEGORIES = new Set(["NAILS", "SKIN", "FACIAL", "SPA", "EYELASH"]);

async function requirePilot(businessSlug: string) {
  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) return auth;
  if (businessSlug !== PILOT_SLUG) return { success: false as const, error: "Reference discovery is currently a Beautyfeel pilot." };
  const business = await prisma.business.findUnique({ where: { slug: businessSlug }, select: { id: true } });
  return business ? { success: true as const, auth, business } : { success: false as const, error: "Business not found." };
}

export async function suggestBeautyfeelReferencesAction(input: { businessSlug: string; serviceCategory: string; moodTags: string[] }) {
  const access = await requirePilot(input.businessSlug);
  if (!access.success) return access;
  const category = input.serviceCategory.toUpperCase();
  if (!ALLOWED_CATEGORIES.has(category)) return { success: false as const, error: "Unsupported Beautyfeel service category." };
  if (!process.env.PEXELS_API_KEY) return { success: false as const, error: "PEXELS_API_KEY is required for licensed reference discovery." };
  const moods = input.moodTags.map((tag) => tag.trim()).filter(Boolean).slice(0, 5);
  const query = [`premium ${category.toLowerCase()} beauty spa editorial`, ...moods].join(" ");
  const response = await fetch(`https://api.pexels.com/v1/search?orientation=portrait&per_page=12&query=${encodeURIComponent(query)}`, { headers: { Authorization: process.env.PEXELS_API_KEY }, cache: "no-store" });
  if (!response.ok) return { success: false as const, error: "Licensed reference provider is unavailable." };
  const payload = await response.json() as { photos?: Array<{ id: number; url: string; photographer: string; src: { large2x?: string; large?: string; medium?: string }; width: number; height: number }> };
  const candidates = (payload.photos ?? []).map((photo) => ({
    business_id: access.business.id, provider: "PEXELS", provider_id: String(photo.id), source_url: photo.url,
    preview_url: photo.src.large2x ?? photo.src.large ?? photo.src.medium, creator_name: photo.photographer,
    attribution: `Photo by ${photo.photographer} on Pexels`, license_status: "PEXELS_LICENSE_REVIEW_REQUIRED",
    service_category: category, mood_tags: moods, quality_score: Math.min(5, 3.5 + Math.min(photo.width, photo.height) / 4000), link_only: false,
  }));
  for (const candidate of candidates) {
    await prisma.referenceCandidate.upsert({
      where: { business_id_provider_source_url: { business_id: access.business.id, provider: candidate.provider, source_url: candidate.source_url } },
      create: candidate,
      update: { preview_url: candidate.preview_url, mood_tags: moods, quality_score: candidate.quality_score },
    });
  }
  return { success: true as const, data: await prisma.referenceCandidate.findMany({ where: { business_id: access.business.id, status: "PENDING", service_category: category }, orderBy: [{ quality_score: "desc" }, { created_at: "desc" }] }) };
}

export async function addLinkOnlyReferenceCandidateAction(input: { businessSlug: string; sourceUrl: string; serviceCategory: string; moodTags: string[] }) {
  const access = await requirePilot(input.businessSlug);
  if (!access.success) return access;
  const url = new URL(input.sourceUrl);
  const provider = /(^|\.)pinterest\./i.test(url.hostname) || /(^|\.)pin\.it$/i.test(url.hostname) ? "PINTEREST" : "WEB_LINK";
  const candidate = await prisma.referenceCandidate.upsert({
    where: { business_id_provider_source_url: { business_id: access.business.id, provider, source_url: url.toString() } },
    create: { business_id: access.business.id, provider, source_url: url.toString(), license_status: "UNVERIFIED_LINK_ONLY", service_category: input.serviceCategory.toUpperCase(), mood_tags: input.moodTags.slice(0, 5), link_only: true },
    update: { mood_tags: input.moodTags.slice(0, 5) },
  });
  return { success: true as const, data: candidate };
}

export async function approveReferenceCandidateAction(input: { businessSlug: string; candidateId: string; rightsConfirmed: boolean }) {
  const access = await requirePilot(input.businessSlug);
  if (!access.success) return access;
  if (!input.rightsConfirmed) return { success: false as const, error: "Confirm usage rights before approval." };
  const candidate = await prisma.referenceCandidate.findFirst({ where: { id: input.candidateId, business_id: access.business.id, status: "PENDING" } });
  if (!candidate) return { success: false as const, error: "Pending candidate not found." };
  if (candidate.link_only || !candidate.preview_url) return { success: false as const, error: "Link-only candidates cannot be imported until an owned or licensed file is supplied." };
  const response = await fetch(candidate.preview_url, { cache: "no-store" });
  if (!response.ok) return { success: false as const, error: "Candidate image could not be downloaded." };
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024) return { success: false as const, error: "Candidate exceeds the 10 MB limit." };
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const duplicate = await prisma.referenceCandidate.findFirst({ where: { business_id: access.business.id, content_hash: contentHash, status: "APPROVED" } });
  if (duplicate) return { success: false as const, error: "A visually identical file has already been approved." };
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const blob = await put(`brand-assets/${input.businessSlug}/references/${candidate.id}.jpg`, bytes, { access: "public", contentType, addRandomSuffix: true });
  const asset = await prisma.$transaction(async (tx) => {
    const created = await tx.brandAsset.create({ data: { business_id: access.business.id, kind: "REFERENCE", reference_subject: "STYLE", url: blob.url, storage_key: blob.pathname, alt: `${candidate.service_category} ${candidate.mood_tags.join(" ")} reference`, uploaded_by_user_id: access.auth.session.user.id } });
    await tx.referenceCandidate.update({ where: { id: candidate.id }, data: { status: "APPROVED", approved_asset_id: created.id, content_hash: contentHash, license_status: "RIGHTS_CONFIRMED_BY_DEVELOPER" } });
    return created;
  });
  revalidatePath(`/app/${input.businessSlug}/social-posts`);
  return { success: true as const, data: asset };
}

export async function rejectReferenceCandidateAction(input: { businessSlug: string; candidateId: string }) {
  const access = await requirePilot(input.businessSlug);
  if (!access.success) return access;
  await prisma.referenceCandidate.updateMany({ where: { id: input.candidateId, business_id: access.business.id, status: "PENDING" }, data: { status: "REJECTED" } });
  return { success: true as const };
}
