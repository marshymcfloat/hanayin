/**
 * Booking-editor telemetry. Single funnel for `booking.modified.*`
 * events fired by the actions in lib/server actions/booking-modify.ts.
 *
 * Default implementation:
 *   - Sentry breadcrumb (if instrumentation is loaded — graceful no-op
 *     when @sentry/nextjs isn't on the import path or the env hasn't
 *     opted in via SENTRY_DSN).
 *   - Lightweight console.info in development for quick local feedback.
 *
 * The shape is intentionally minimal: action verb, businessId, actor
 * role, duration in milliseconds, success boolean. Anything richer
 * goes via the AuditLog which is the system of record.
 *
 * Future: route into a typed analytics provider (PostHog, Mixpanel,
 * Datadog) by editing this module — call sites won't change.
 */

export type BookingModifiedAction =
  | "ADD_SERVICE"
  | "REMOVE_SERVICE"
  | "SWAP_SERVICE"
  | "RESCHEDULE"
  | "REASSIGN_STAFF"
  | "ADJUST_PRICE"
  | "CANCEL"
  | "MARK_NO_SHOW"
  | "ADD_NOTE";

export type BookingTelemetryEvent = {
  action: BookingModifiedAction;
  businessId: string;
  /** "OWNER" | "EMPLOYEE" — lower-cardinality than profile by design. */
  actorRole: "OWNER" | "EMPLOYEE";
  /** Time the action took, server-side, in ms. */
  durationMs: number;
  success: boolean;
  /** When success === false: the typed error code if one was returned. */
  errorCode?: string;
};

/**
 * Record a booking-modified event. Safe to call from any server
 * action; never throws (telemetry must not break user actions).
 */
export function recordBookingModified(event: BookingTelemetryEvent): void {
  try {
    // Dev console output for quick local feedback.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.info(
        `[telemetry] booking.modified.${event.action.toLowerCase()}`,
        {
          businessId: event.businessId,
          actorRole: event.actorRole,
          durationMs: event.durationMs,
          success: event.success,
          errorCode: event.errorCode,
        },
      );
    }

    // Sentry breadcrumb — best-effort. We dynamic-import so that
    // edge runtimes / tests without Sentry don't break.
    void emitSentryBreadcrumb(event);
  } catch {
    // Telemetry is fire-and-forget. Swallow.
  }
}

async function emitSentryBreadcrumb(event: BookingTelemetryEvent) {
  try {
    const sentry = await import("@sentry/nextjs").catch(() => null);
    if (!sentry?.addBreadcrumb) return;
    sentry.addBreadcrumb({
      category: "booking.modified",
      message: `booking.modified.${event.action.toLowerCase()}`,
      level: event.success ? "info" : "warning",
      data: {
        businessId: event.businessId,
        actorRole: event.actorRole,
        durationMs: event.durationMs,
        success: event.success,
        errorCode: event.errorCode,
      },
    });
  } catch {
    // Swallow.
  }
}

/**
 * Helper for measuring + recording a server action's lifetime in one
 * line. Returns a "finish" callback the caller invokes after the
 * action completes (success or failure).
 *
 * @example
 *   const finish = startBookingTimer({ action: "REMOVE_SERVICE", businessId, actorRole });
 *   // ... do the work ...
 *   finish({ success: true });
 */
export function startBookingTimer(input: {
  action: BookingModifiedAction;
  businessId: string;
  actorRole: "OWNER" | "EMPLOYEE";
}) {
  const startedAt = Date.now();
  return function finish(result: { success: boolean; errorCode?: string }) {
    recordBookingModified({
      ...input,
      durationMs: Date.now() - startedAt,
      success: result.success,
      errorCode: result.errorCode,
    });
  };
}
