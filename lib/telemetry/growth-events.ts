/**
 * Growth-engine telemetry. Mirrors lib/telemetry/booking-events.ts —
 * pluggable, non-throwing, dev console + Sentry breadcrumb.
 *
 * Wave J3: Captures campaign generation events so we can measure how
 * often Wave I4 auto-picks survive owner override. The pickCampaignStyling
 * helper already returns ownerOverrodeCaptionTone / ownerOverrodeImageProfile
 * booleans, so the action just forwards them here.
 */

import type { OfferTypeLiteral } from "@/lib/services/growth/types";
import type { SocialImageProfile } from "@/lib/services/social/image-profiles";
import type { CaptionTone } from "@/lib/zod-schemas/growth";

export type GrowthCampaignAction = "GENERATED";

export type GrowthCampaignTelemetryEvent = {
  action: GrowthCampaignAction;
  businessId: string;
  /** "OWNER" | "EMPLOYEE" — lower-cardinality than profile by design. */
  actorRole: "OWNER" | "EMPLOYEE";
  durationMs: number;
  success: boolean;
  errorCode?: string;

  /** Concrete offer the engine generated (FLASH_DEAL, BUNDLE, …). */
  offerType: OfferTypeLiteral;
  /** Caption tone the offer-side brief recommended. */
  inferredCaptionTone: CaptionTone;
  /** Final caption tone applied (owner pick, or inferred). */
  actualCaptionTone: CaptionTone;
  /** Image profile the offer-side brief recommended. */
  inferredImageProfile: SocialImageProfile;
  /** Final image profile applied. */
  actualImageProfile: SocialImageProfile;

  ownerOverrodeCaptionTone: boolean;
  ownerOverrodeImageProfile: boolean;

  /**
   * True when the action ran AI generation (caption variants and image
   * generation). Currently always true for GENERATED — kept explicit so
   * future code paths that skip AI (e.g. dry-run preview) report
   * accurately.
   */
  aiInvoked?: boolean;
};

export function recordGrowthCampaign(event: GrowthCampaignTelemetryEvent): void {
  try {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.info(
        `[telemetry] growth.campaign.${event.action.toLowerCase()}`,
        {
          businessId: event.businessId,
          actorRole: event.actorRole,
          durationMs: event.durationMs,
          success: event.success,
          errorCode: event.errorCode,
          offerType: event.offerType,
          inferredCaptionTone: event.inferredCaptionTone,
          actualCaptionTone: event.actualCaptionTone,
          inferredImageProfile: event.inferredImageProfile,
          actualImageProfile: event.actualImageProfile,
          ownerOverrodeCaptionTone: event.ownerOverrodeCaptionTone,
          ownerOverrodeImageProfile: event.ownerOverrodeImageProfile,
          aiInvoked: event.aiInvoked,
        },
      );
    }
    void emitSentryBreadcrumb(event);
  } catch {
    // fire-and-forget
  }
}

async function emitSentryBreadcrumb(event: GrowthCampaignTelemetryEvent) {
  try {
    const sentry = await import("@sentry/nextjs").catch(() => null);
    if (!sentry?.addBreadcrumb) return;
    sentry.addBreadcrumb({
      category: "growth.campaign",
      message: `growth.campaign.${event.action.toLowerCase()}`,
      level: event.success ? "info" : "warning",
      data: {
        businessId: event.businessId,
        actorRole: event.actorRole,
        durationMs: event.durationMs,
        success: event.success,
        errorCode: event.errorCode,
        offerType: event.offerType,
        inferredCaptionTone: event.inferredCaptionTone,
        actualCaptionTone: event.actualCaptionTone,
        inferredImageProfile: event.inferredImageProfile,
        actualImageProfile: event.actualImageProfile,
        ownerOverrodeCaptionTone: event.ownerOverrodeCaptionTone,
        ownerOverrodeImageProfile: event.ownerOverrodeImageProfile,
        aiInvoked: event.aiInvoked,
      },
    });
  } catch {
    // swallow
  }
}

/**
 * Helper for measuring + recording a growth-campaign generation lifetime
 * in one line. The offerType + inferred picks are captured at action
 * entry; the final picks + override booleans + aiInvoked are passed in
 * at finish.
 */
export function startGrowthCampaignTimer(input: {
  action: GrowthCampaignAction;
  businessId: string;
  actorRole: "OWNER" | "EMPLOYEE";
  offerType: OfferTypeLiteral;
  inferredCaptionTone: CaptionTone;
  inferredImageProfile: SocialImageProfile;
}) {
  const startedAt = Date.now();
  return function finish(result: {
    success: boolean;
    errorCode?: string;
    actualCaptionTone: CaptionTone;
    actualImageProfile: SocialImageProfile;
    ownerOverrodeCaptionTone: boolean;
    ownerOverrodeImageProfile: boolean;
    aiInvoked?: boolean;
  }) {
    recordGrowthCampaign({
      ...input,
      durationMs: Date.now() - startedAt,
      success: result.success,
      errorCode: result.errorCode,
      actualCaptionTone: result.actualCaptionTone,
      actualImageProfile: result.actualImageProfile,
      ownerOverrodeCaptionTone: result.ownerOverrodeCaptionTone,
      ownerOverrodeImageProfile: result.ownerOverrodeImageProfile,
      aiInvoked: result.aiInvoked,
    });
  };
}
