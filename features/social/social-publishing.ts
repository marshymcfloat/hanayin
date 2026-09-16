/** Tenant rollout controls for Meta social publishing. */
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

export function isSocialPublishingGloballyEnabled() {
  return parseBoolean(process.env.SOCIAL_PUBLISHING_ENABLED);
}

export function getSocialPublishingPilotSlugs() {
  return parsePilotSlugs(process.env.SOCIAL_PUBLISHING_PILOT_SLUGS);
}

export function isSocialPublishingEnabledForBusiness(businessSlug: string) {
  if (!isSocialPublishingGloballyEnabled()) {
    return false;
  }

  const pilotSlugs = getSocialPublishingPilotSlugs();
  if (pilotSlugs.length === 0) {
    return true;
  }

  return pilotSlugs.includes(businessSlug.trim().toLowerCase());
}
