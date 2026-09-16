"use server";

import {
  createOrganicSocialPost,
  deleteSocialPostDraft,
  disconnectSocialConnection,
  generateOrganicCaption,
  generateSocialCaption,
  generateSocialPostImage,
  getSocialConnections,
  publishSocialPost,
  regenerateSocialPostCaption,
  retrySocialPostTarget,
  updateSocialPostDraft,
} from "@/features/social/services/social";

export async function getSocialConnectionsAction(
  input: Parameters<typeof getSocialConnections>[0],
) {
  return getSocialConnections(input);
}

export async function disconnectSocialConnectionAction(
  input: Parameters<typeof disconnectSocialConnection>[0],
) {
  return disconnectSocialConnection(input);
}

export async function generateSocialCaptionAction(
  input: Parameters<typeof generateSocialCaption>[0],
) {
  return generateSocialCaption(input);
}

export async function createOrganicSocialPostAction(
  input: Parameters<typeof createOrganicSocialPost>[0],
) {
  return createOrganicSocialPost(input);
}

export async function generateOrganicCaptionAction(
  input: Parameters<typeof generateOrganicCaption>[0],
) {
  return generateOrganicCaption(input);
}

export async function updateSocialPostDraftAction(
  input: Parameters<typeof updateSocialPostDraft>[0],
) {
  return updateSocialPostDraft(input);
}

export async function deleteSocialPostDraftAction(
  input: Parameters<typeof deleteSocialPostDraft>[0],
) {
  return deleteSocialPostDraft(input);
}

export async function generateSocialPostImageAction(
  input: Parameters<typeof generateSocialPostImage>[0],
) {
  return generateSocialPostImage(input);
}

export async function regenerateSocialPostCaptionAction(
  input: Parameters<typeof regenerateSocialPostCaption>[0],
) {
  return regenerateSocialPostCaption(input);
}

export async function publishSocialPostAction(
  input: Parameters<typeof publishSocialPost>[0],
) {
  return publishSocialPost(input);
}

export async function retrySocialPostTargetAction(
  input: Parameters<typeof retrySocialPostTarget>[0],
) {
  return retrySocialPostTarget(input);
}
