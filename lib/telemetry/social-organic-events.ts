/**
 * Organic-post-creation telemetry. Mirrors lib/telemetry/booking-events.ts —
 * pluggable, non-throwing, dev console + Sentry breadcrumb.
 *
 * Wave J2: We want to know how often the I3/I5 smart defaults are
 * accepted vs. overridden. Each event captures both the inferred and
 * the actually-applied values for mood / visual focus / image profile /
 * caption tone, plus owner-override booleans for fast aggregation. If
 * owners override one axis frequently, that is feedback the inference
 * helper needs tightening.
 */

import type { OrganicPostCategory } from "@/lib/services/social/caption-generator";
import type { SocialImageProfile } from "@/lib/services/social/image-profiles";
import type { CaptionTone } from "@/lib/zod-schemas/growth";

export type OrganicPostAction = "CREATED";

export type OrganicPostTelemetryEvent = {
  action: OrganicPostAction;
  businessId: string;
  /** "OWNER" | "EMPLOYEE" — lower-cardinality than profile by design. */
  actorRole: "OWNER" | "EMPLOYEE";
  durationMs: number;
  success: boolean;
  errorCode?: string;

  /** Post category the user picked in the dialog. */
  category: OrganicPostCategory;
  /** Image profile inferred by inferCreativeBrief from (category, topic). */
  inferredImageProfile: SocialImageProfile;
  /** Image profile actually used after override sentinel resolution. */
  actualImageProfile: SocialImageProfile;
  /** Caption tone inferred by inferCreativeBrief. */
  inferredCaptionTone: CaptionTone;
  /** Caption tone actually used (owner pick, or auto when "AUTO"). */
  actualCaptionTone: CaptionTone;

  /**
   * True when the owner set a non-default mood (i.e. provided an explicit
   * mood string distinct from the inferred mood). Lets us aggregate
   * "override rate per axis" without sending the raw strings.
   */
  ownerOverrodeMood: boolean;
  ownerOverrodeFocus: boolean;
  ownerOverrodeImageProfile: boolean;
  ownerOverrodeCaptionTone: boolean;

  /**
   * True when the H6 educational overlay was composed onto the generated
   * image (imageProfile === EDUCATIONAL and a non-empty topic was
   * available to use as the headline).
   */
  educationalOverlayApplied?: boolean;

  /**
   * Set when the action actually triggered AI generation. Mirrors the
   * social-post-request convention so cost dashboards can attribute
   * spend by feature.
   */
  aiInvoked?: boolean;
};

export function recordOrganicPost(event: OrganicPostTelemetryEvent): void {
  try {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[telemetry] social.organic_post.${event.action.toLowerCase()}`,
        {
          businessId: event.businessId,
          actorRole: event.actorRole,
          durationMs: event.durationMs,
          success: event.success,
          errorCode: event.errorCode,
          category: event.category,
          inferredImageProfile: event.inferredImageProfile,
          actualImageProfile: event.actualImageProfile,
          inferredCaptionTone: event.inferredCaptionTone,
          actualCaptionTone: event.actualCaptionTone,
          ownerOverrodeMood: event.ownerOverrodeMood,
          ownerOverrodeFocus: event.ownerOverrodeFocus,
          ownerOverrodeImageProfile: event.ownerOverrodeImageProfile,
          ownerOverrodeCaptionTone: event.ownerOverrodeCaptionTone,
          educationalOverlayApplied: event.educationalOverlayApplied,
          aiInvoked: event.aiInvoked,
        },
      );
    }
    void emitSentryBreadcrumb(event);
  } catch {
    // fire-and-forget
  }
}

async function emitSentryBreadcrumb(event: OrganicPostTelemetryEvent) {
  try {
    const sentry = await import("@sentry/nextjs").catch(() => null);
    if (!sentry?.addBreadcrumb) return;
    sentry.addBreadcrumb({
      category: "social.organic_post",
      message: `social.organic_post.${event.action.toLowerCase()}`,
      level: event.success ? "info" : "warning",
      data: {
        businessId: event.businessId,
        actorRole: event.actorRole,
        durationMs: event.durationMs,
        success: event.success,
        errorCode: event.errorCode,
        category: event.category,
        inferredImageProfile: event.inferredImageProfile,
        actualImageProfile: event.actualImageProfile,
        inferredCaptionTone: event.inferredCaptionTone,
        actualCaptionTone: event.actualCaptionTone,
        ownerOverrodeMood: event.ownerOverrodeMood,
        ownerOverrodeFocus: event.ownerOverrodeFocus,
        ownerOverrodeImageProfile: event.ownerOverrodeImageProfile,
        ownerOverrodeCaptionTone: event.ownerOverrodeCaptionTone,
        educationalOverlayApplied: event.educationalOverlayApplied,
        aiInvoked: event.aiInvoked,
      },
    });
  } catch {
    // swallow
  }
}

/**
 * Helper for measuring + recording an organic-post creation lifetime in
 * one line. The inference snapshot is captured at start; the overrides
 * and AI-invoked booleans are passed in at finish, when the action knows
 * what actually got applied.
 *
 * @example
 *   const finish = startOrganicPostTimer({
 *     action: "CREATED",
 *     businessId: actor.businessId,
 *     actorRole: actor.actorType,
 *     category,
 *     inferredImageProfile: brief.imageProfile,
 *     inferredCaptionTone: brief.captionTone,
 *   });
 *   // ... do the work ...
 *   finish({
 *     success: true,
 *     actualImageProfile,
 *     actualCaptionTone,
 *     ownerOverrodeMood,
 *     ownerOverrodeFocus,
 *     ownerOverrodeImageProfile,
 *     ownerOverrodeCaptionTone,
 *     educationalOverlayApplied,
 *     aiInvoked: true,
 *   });
 */
export function startOrganicPostTimer(input: {
  action: OrganicPostAction;
  businessId: string;
  actorRole: "OWNER" | "EMPLOYEE";
  category: OrganicPostCategory;
  inferredImageProfile: SocialImageProfile;
  inferredCaptionTone: CaptionTone;
}) {
  const startedAt = Date.now();
  return function finish(result: {
    success: boolean;
    errorCode?: string;
    actualImageProfile: SocialImageProfile;
    actualCaptionTone: CaptionTone;
    ownerOverrodeMood: boolean;
    ownerOverrodeFocus: boolean;
    ownerOverrodeImageProfile: boolean;
    ownerOverrodeCaptionTone: boolean;
    educationalOverlayApplied?: boolean;
    aiInvoked?: boolean;
  }) {
    recordOrganicPost({
      ...input,
      durationMs: Date.now() - startedAt,
      success: result.success,
      errorCode: result.errorCode,
      actualImageProfile: result.actualImageProfile,
      actualCaptionTone: result.actualCaptionTone,
      ownerOverrodeMood: result.ownerOverrodeMood,
      ownerOverrodeFocus: result.ownerOverrodeFocus,
      ownerOverrodeImageProfile: result.ownerOverrodeImageProfile,
      ownerOverrodeCaptionTone: result.ownerOverrodeCaptionTone,
      educationalOverlayApplied: result.educationalOverlayApplied,
      aiInvoked: result.aiInvoked,
    });
  };
}
