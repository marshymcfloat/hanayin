/**
 * Feature flag for the social-post-request workflow (Wave E).
 *
 * Falls back to `false` when the parent SOCIAL_PUBLISHING_ENABLED flag
 * is off — the request workflow ultimately produces a SocialPost that
 * needs the publishing pipeline to be live to actually reach Meta.
 *
 * Two env vars:
 *   - SOCIAL_POST_REQUESTS_ENABLED: boolean master switch.
 *   - SOCIAL_POST_REQUESTS_PILOT_SLUGS: optional CSV of business slugs
 *     that opt in. When provided, only those tenants see the request
 *     workflow even though the master switch is on.
 *
 * The owner-side direct organic post creation (CreateOrganicPostDialog)
 * is NOT gated by this flag — it remains available wherever
 * SOCIAL_PUBLISHING_ENABLED is true. This flag specifically gates the
 * staff-facing SuggestPostDialog, the reviewer inbox, and the
 * /social-posts/my-requests page.
 */

import { isSocialPublishingEnabledForBusiness } from "@/features/social/social-publishing";

function parseBoolean(value: string | undefined) {
  if (!value) return false;
  return value.trim().toLowerCase() === "true";
}

function parsePilotSlugs(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((slug) => slug.trim().toLowerCase())
    .filter(Boolean);
}

export function isSocialPostRequestsGloballyEnabled() {
  return parseBoolean(process.env.SOCIAL_POST_REQUESTS_ENABLED);
}

export function getSocialPostRequestsPilotSlugs() {
  return parsePilotSlugs(process.env.SOCIAL_POST_REQUESTS_PILOT_SLUGS);
}

export function isSocialPostRequestsEnabledForBusiness(businessSlug: string) {
  // Hard prerequisite: publishing must be on. Without it, an approved
  // request can be drafted but never reaches the customer.
  if (!isSocialPublishingEnabledForBusiness(businessSlug)) {
    return false;
  }

  if (!isSocialPostRequestsGloballyEnabled()) {
    return false;
  }

  const pilotSlugs = getSocialPostRequestsPilotSlugs();
  if (pilotSlugs.length === 0) {
    return true;
  }

  return pilotSlugs.includes(businessSlug.trim().toLowerCase());
}
