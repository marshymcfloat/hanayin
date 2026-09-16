/**
 * Feature flag for the booking-editor track (Wave A through Wave C).
 *
 * Two env vars:
 *   - BOOKING_EDITOR_ENABLED: boolean, master switch.
 *   - BOOKING_EDITOR_PILOT_SLUGS: optional CSV of business slugs that
 *     opt in. When provided, only those tenants see the new
 *     in-place-modification UI even though the master switch is on.
 *     When omitted (or empty) and the master switch is on, every
 *     tenant gets the editor.
 *
 * The Server Actions in features/bookings/actions/booking-modify.ts run
 * regardless of this flag — they enforce permissions at the action
 * layer. The flag gates *exposure* in the UI: triggers, dialogs, and
 * surfaces that didn't exist before. Disabling the flag silently
 * removes those affordances; the underlying data model is unchanged.
 */

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

export function isBookingEditorGloballyEnabled() {
  return parseBoolean(process.env.BOOKING_EDITOR_ENABLED);
}

export function getBookingEditorPilotSlugs() {
  return parsePilotSlugs(process.env.BOOKING_EDITOR_PILOT_SLUGS);
}

export function isBookingEditorEnabledForBusiness(businessSlug: string) {
  if (!isBookingEditorGloballyEnabled()) {
    return false;
  }

  const pilotSlugs = getBookingEditorPilotSlugs();
  if (pilotSlugs.length === 0) {
    return true;
  }

  return pilotSlugs.includes(businessSlug.trim().toLowerCase());
}
