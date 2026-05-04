/**
 * Social-post-request telemetry. Mirrors lib/telemetry/booking-events.ts
 * — pluggable, non-throwing, dev console + Sentry breadcrumb.
 *
 * Distinct from the booking telemetry because the action verbs and
 * cost model differ: approval triggers AI generation, so the approve
 * event carries an `aiCostHint` field future dashboards can use to
 * attribute AI spend to the request feature.
 */

export type SocialPostRequestAction =
  | "SUBMITTED"
  | "UPDATED"
  | "CANCELLED"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED";

export type SocialTelemetryEvent = {
  action: SocialPostRequestAction;
  businessId: string;
  /** "OWNER" | "EMPLOYEE" — lower-cardinality than profile by design. */
  actorRole: "OWNER" | "EMPLOYEE";
  durationMs: number;
  success: boolean;
  errorCode?: string;
  /**
   * Set on APPROVED events when the action actually triggered AI
   * generation. Lets a downstream cost dashboard tag spend by feature
   * without re-walking the audit log. Boolean for v1; future revisions
   * can carry a token / dollar estimate when those become available.
   */
  aiInvoked?: boolean;
};

export function recordSocialPostRequest(event: SocialTelemetryEvent): void {
  try {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.info(
        `[telemetry] social.post_request.${event.action.toLowerCase()}`,
        {
          businessId: event.businessId,
          actorRole: event.actorRole,
          durationMs: event.durationMs,
          success: event.success,
          errorCode: event.errorCode,
          aiInvoked: event.aiInvoked,
        },
      );
    }
    void emitSentryBreadcrumb(event);
  } catch {
    // fire-and-forget
  }
}

async function emitSentryBreadcrumb(event: SocialTelemetryEvent) {
  try {
    const sentry = await import("@sentry/nextjs").catch(() => null);
    if (!sentry?.addBreadcrumb) return;
    sentry.addBreadcrumb({
      category: "social.post_request",
      message: `social.post_request.${event.action.toLowerCase()}`,
      level: event.success ? "info" : "warning",
      data: {
        businessId: event.businessId,
        actorRole: event.actorRole,
        durationMs: event.durationMs,
        success: event.success,
        errorCode: event.errorCode,
        aiInvoked: event.aiInvoked,
      },
    });
  } catch {
    // swallow
  }
}

/**
 * Helper for measuring + recording a server action's lifetime in one
 * line. Returns a finish callback the action invokes after the work
 * completes.
 *
 * @example
 *   const finish = startSocialPostRequestTimer({
 *     action: "SUBMITTED",
 *     businessId: actor.businessId,
 *     actorRole: actor.actorType,
 *   });
 *   // ... do work ...
 *   finish({ success: true });
 */
export function startSocialPostRequestTimer(input: {
  action: SocialPostRequestAction;
  businessId: string;
  actorRole: "OWNER" | "EMPLOYEE";
}) {
  const startedAt = Date.now();
  return function finish(result: {
    success: boolean;
    errorCode?: string;
    aiInvoked?: boolean;
  }) {
    recordSocialPostRequest({
      ...input,
      durationMs: Date.now() - startedAt,
      success: result.success,
      errorCode: result.errorCode,
      aiInvoked: result.aiInvoked,
    });
  };
}
