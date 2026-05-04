/**
 * Social-feature viewer context derivation. Parallel to
 * deriveBookingViewerContext but produces flags for the social-post
 * surfaces (request submission, reviewer inbox, draft editing,
 * publishing, analytics).
 *
 * Single source of truth: docs/role-permissions-matrix.md §4.
 *
 * Owner short-circuits to all-true. Employees evaluate against their
 * StaffPermission set; managers/cashiers/staff differ only via their
 * default permission lists in lib/auth/staff-access.ts.
 */

import type { ViewerContextValue } from "@/lib/auth/viewer-context";
import { Role } from "@/prisma/generated/prisma/enums";

export type SocialViewerContext = {
  /** Caller can submit a new SocialPostRequest. */
  canSubmitRequest: boolean;
  /** Caller can review (approve/reject) requests submitted by others. */
  canReviewRequests: boolean;
  /** Caller can edit a SocialPost draft (caption, media). */
  canEditDraft: boolean;
  /** Caller can publish a SocialPost draft to connected channels. */
  canPublish: boolean;
  /** Caller can view analytics on published posts. */
  canViewAnalytics: boolean;
};

const OWNER_ALL_TRUE: SocialViewerContext = {
  canSubmitRequest: true,
  canReviewRequests: true,
  canEditDraft: true,
  canPublish: true,
  canViewAnalytics: true,
};

export function deriveSocialViewerContext(
  viewer: ViewerContextValue,
): SocialViewerContext {
  if (viewer.role === Role.OWNER) {
    return OWNER_ALL_TRUE;
  }

  const perms = new Set(viewer.permissions);

  // Reviewer permissions also let the reviewer edit the resulting
  // draft (they're effectively a junior owner for the post they
  // approved). Publishing is its own opt-in flag — most reviewers
  // never get it, owners delegate carefully.
  const canReviewRequests = perms.has("SOCIAL_POST_REVIEW");

  return {
    canSubmitRequest: perms.has("SOCIAL_POST_REQUEST_CREATE"),
    canReviewRequests,
    canEditDraft: canReviewRequests,
    canPublish: perms.has("SOCIAL_POST_PUBLISH"),
    canViewAnalytics: canReviewRequests,
  };
}
