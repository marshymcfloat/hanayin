/**
 * Tiered cancellation/reschedule window for customer self-serve.
 *
 *   > 24 h  → "free": full self-serve, no warning
 *   6–24 h  → "short_notice": allowed but the UI shows a warning
 *   < 6 h   → "blocked": customer must call the business
 *   already past → "blocked"
 *
 * Both cancel and reschedule share the same gate. Centralizing the
 * decision here keeps the server-action and the page in sync — if a
 * customer reaches the page just inside the 6-hour window and the
 * action runs after the boundary, the action's check is authoritative.
 */
export type SelfServeWindow = "free" | "short_notice" | "blocked";

export const SELF_SERVE_FREE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
export const SELF_SERVE_BLOCK_THRESHOLD_MS = 6 * 60 * 60 * 1000;

export function classifySelfServeWindow(
  scheduledAt: Date | null | undefined,
  now: Date = new Date(),
): SelfServeWindow {
  if (!scheduledAt) return "blocked";
  const ms = scheduledAt.getTime() - now.getTime();
  if (ms <= SELF_SERVE_BLOCK_THRESHOLD_MS) return "blocked";
  if (ms < SELF_SERVE_FREE_THRESHOLD_MS) return "short_notice";
  return "free";
}

export function isSelfServeAllowed(
  scheduledAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return classifySelfServeWindow(scheduledAt, now) !== "blocked";
}
