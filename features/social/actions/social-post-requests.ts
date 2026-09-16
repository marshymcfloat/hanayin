"use server";

import {
  approveSocialPostRequest,
  cancelSocialPostRequest,
  listSocialPostRequests,
  rejectSocialPostRequest,
  submitSocialPostRequest,
  updateSocialPostRequest,
} from "@/features/social/services/social-post-requests";

export type {
  ApproveSocialPostRequestResult,
  CancelSocialPostRequestResult,
  ListSocialPostRequestsResult,
  RejectSocialPostRequestResult,
  SocialPostRequestSummary,
  SubmitSocialPostRequestResult,
  UpdateSocialPostRequestResult,
} from "@/features/social/services/social-post-requests";

export async function submitSocialPostRequestAction(
  input: Parameters<typeof submitSocialPostRequest>[0],
) {
  return submitSocialPostRequest(input);
}

export async function updateSocialPostRequestAction(
  input: Parameters<typeof updateSocialPostRequest>[0],
) {
  return updateSocialPostRequest(input);
}

export async function cancelSocialPostRequestAction(
  input: Parameters<typeof cancelSocialPostRequest>[0],
) {
  return cancelSocialPostRequest(input);
}

export async function approveSocialPostRequestAction(
  input: Parameters<typeof approveSocialPostRequest>[0],
) {
  return approveSocialPostRequest(input);
}

export async function rejectSocialPostRequestAction(
  input: Parameters<typeof rejectSocialPostRequest>[0],
) {
  return rejectSocialPostRequest(input);
}

export async function listSocialPostRequestsAction(
  input: Parameters<typeof listSocialPostRequests>[0],
) {
  return listSocialPostRequests(input);
}
