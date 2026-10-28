"use server";

import { revalidatePath } from "next/cache";
import { addReferenceLinkSchema, approveReferenceCandidateSchema, rejectReferenceCandidateSchema, suggestReferenceCandidatesSchema } from "@/features/social/reference-candidate-schemas";
import { requireReferencePilotAccess, referenceCandidateFailure } from "@/features/social/reference-candidate-access";
import { addReferenceLink, approveReferenceCandidate, rejectReferenceCandidate, suggestReferenceCandidates } from "@/features/social/services/reference-candidates";

export async function suggestBeautyfeelReferencesAction(input: { businessSlug: string; serviceCategory: string; moodTags: string[] }) {
  const validation = suggestReferenceCandidatesSchema.safeParse(input);
  if (!validation.success) return { success: false as const, error: "Invalid input" };
  try {
    const access = await requireReferencePilotAccess(validation.data.businessSlug);
    return access.success ? await suggestReferenceCandidates(access.actor, validation.data) : access;
  } catch (error) { return referenceCandidateFailure(error); }
}
export async function addLinkOnlyReferenceCandidateAction(input: { businessSlug: string; sourceUrl: string; serviceCategory: string; moodTags: string[] }) {
  const validation = addReferenceLinkSchema.safeParse(input);
  if (!validation.success) return { success: false as const, error: "Invalid input" };
  try {
    const access = await requireReferencePilotAccess(validation.data.businessSlug);
    return access.success ? await addReferenceLink(access.actor, validation.data) : access;
  } catch (error) { return referenceCandidateFailure(error); }
}
export async function approveReferenceCandidateAction(input: { businessSlug: string; candidateId: string; rightsConfirmed: boolean }) {
  const validation = approveReferenceCandidateSchema.safeParse(input);
  if (!validation.success) return { success: false as const, error: "Invalid input" };
  try {
    const access = await requireReferencePilotAccess(validation.data.businessSlug);
    if (!access.success) return access;
    const result = await approveReferenceCandidate(access.actor, validation.data);
    if (result.success) { try { revalidatePath(`/app/${access.actor.businessSlug}/social-posts`); } catch { /* Approval already committed. */ } }
    return result;
  } catch (error) { return referenceCandidateFailure(error); }
}
export async function rejectReferenceCandidateAction(input: { businessSlug: string; candidateId: string }) {
  const validation = rejectReferenceCandidateSchema.safeParse(input);
  if (!validation.success) return { success: false as const, error: "Invalid input" };
  try {
    const access = await requireReferencePilotAccess(validation.data.businessSlug);
    return access.success ? await rejectReferenceCandidate(access.actor, validation.data.candidateId) : access;
  } catch (error) { return referenceCandidateFailure(error); }
}
