import { NextResponse } from "next/server";

import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { isSocialPublishingEnabledForBusiness } from "@/features/social/social-publishing";
import { getBusinessEntitlementsBySlug } from "@/features/billing/plan-entitlements";
import { createSignedOAuthState } from "@/lib/services/social/oauth-state";

const META_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];

function buildBusinessSettingsUrl(request: Request, businessSlug: string) {
  return new URL(`/app/${businessSlug}/business`, request.url);
}

function getMetaAppId() {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    throw new Error("META_APP_ID is not configured");
  }
  return appId;
}

function getMetaRedirectUri() {
  const redirectUri = process.env.META_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error("META_REDIRECT_URI is not configured");
  }
  return redirectUri;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const businessSlug = url.searchParams.get("businessSlug")?.trim();
  if (!businessSlug) {
    return NextResponse.json(
      { error: "businessSlug query param is required" },
      { status: 400 },
    );
  }

  const settingsUrl = buildBusinessSettingsUrl(request, businessSlug);
  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.social) {
    settingsUrl.searchParams.set("socialError", "plan_not_entitled");
    return NextResponse.redirect(settingsUrl);
  }

  if (!isSocialPublishingEnabledForBusiness(businessSlug)) {
    settingsUrl.searchParams.set("socialError", "feature_not_enabled");
    return NextResponse.redirect(settingsUrl);
  }

  const auth = await requireOwnerTenantWriteAccess(businessSlug);
  if (!auth.success) {
    settingsUrl.searchParams.set("socialError", "unauthorized");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const state = createSignedOAuthState({
      businessSlug,
      userId: auth.session.user.id,
    });

    const oauthUrl = new URL(
      `https://www.facebook.com/${process.env.META_GRAPH_API_VERSION || "v22.0"}/dialog/oauth`,
    );
    oauthUrl.searchParams.set("client_id", getMetaAppId());
    oauthUrl.searchParams.set("redirect_uri", getMetaRedirectUri());
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("scope", META_SCOPES.join(","));

    return NextResponse.redirect(oauthUrl);
  } catch (error) {
    console.error("Failed to start Meta OAuth flow:", error);
    settingsUrl.searchParams.set("socialError", "oauth_start_failed");
    return NextResponse.redirect(settingsUrl);
  }
}
