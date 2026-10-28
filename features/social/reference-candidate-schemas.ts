import "server-only";
import { z } from "zod";
import { businessSlugSchema } from "@/lib/validation/business-slug";

const category = z.string().min(1).max(100).transform(value => value.toUpperCase());
const moods = z.array(z.string().max(200)).max(100);
const candidateId = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/);
export const referenceLinkUrlSchema = z.string().max(2048).url().refine(value => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}).transform(value => new URL(value).toString());
export const trustedReferenceImageUrlSchema = referenceLinkUrlSchema.refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "images.pexels.com" && !url.port;
  } catch { return false; }
});
const pilotInput = { businessSlug: businessSlugSchema, serviceCategory: category, moodTags: moods };
export const suggestReferenceCandidatesSchema = z.object(pilotInput).transform(input => ({ ...input, moodTags: input.moodTags.map(tag => tag.trim()).filter(Boolean).slice(0, 5) }));
export const addReferenceLinkSchema = z.object({ ...pilotInput, sourceUrl: referenceLinkUrlSchema }).transform(input => ({ ...input, moodTags: input.moodTags.slice(0, 5) }));
export const approveReferenceCandidateSchema = z.object({ businessSlug: businessSlugSchema, candidateId, rightsConfirmed: z.boolean() });
export const rejectReferenceCandidateSchema = z.object({ businessSlug: businessSlugSchema, candidateId });
const photoSources = z.object({ large2x: trustedReferenceImageUrlSchema.optional(), large: trustedReferenceImageUrlSchema.optional(), medium: trustedReferenceImageUrlSchema.optional() }).refine(src => !!(src.large2x ?? src.large ?? src.medium));
export const pexelsReferenceResponseSchema = z.object({ photos: z.array(z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), url: referenceLinkUrlSchema, photographer: z.string().min(1).max(200), src: photoSources, width: z.number().finite().positive().max(1000000), height: z.number().finite().positive().max(1000000) })).max(12).default([]) });
export type SuggestReferenceCandidates = z.infer<typeof suggestReferenceCandidatesSchema>;
export type AddReferenceLink = z.infer<typeof addReferenceLinkSchema>;
export type ApproveReferenceCandidate = z.infer<typeof approveReferenceCandidateSchema>;
