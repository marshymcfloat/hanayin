import { NextResponse } from "next/server";

import { requireOwnerTenantWriteAccess } from "@/lib/auth/guards";
import { isSocialPublishingEnabledForBusiness } from "@/lib/features/social-publishing";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";
import {
  exchangeCodeForMetaUserToken,
  getManagedMetaPages,
} from "@/lib/services/social/meta-client";
import { verifySignedOAuthState } from "@/lib/services/social/oauth-state";
import { encryptToken } from "@/lib/services/social/token-crypto";
import { prisma } from "@/prisma/prisma";

function buildBusinessSettingsUrl(request: Request, businessSlug: string) {
  return new URL(`/app/${businessSlug}/business`, request.url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (!state) {
    return NextResponse.json({ error: "Missing OAuth state" }, { status: 400 });
  }

  let parsedState: ReturnType<typeof verifySignedOAuthState>;
  try {
    parsedState = verifySignedOAuthState(state);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid OAuth callback state",
      },
      { status: 400 },
    );
  }

  const settingsUrl = buildBusinessSettingsUrl(request, parsedState.businessSlug);
  const entitlements = await getBusinessEntitlementsBySlug(parsedState.businessSlug);
  if (!entitlements.social) {
    settingsUrl.searchParams.set("socialError", "plan_not_entitled");
    return NextResponse.redirect(settingsUrl);
  }

  if (oauthError) {
    settingsUrl.searchParams.set("socialError", "oauth_denied");
    return NextResponse.redirect(settingsUrl);
  }

  if (!isSocialPublishingEnabledForBusiness(parsedState.businessSlug)) {
    settingsUrl.searchParams.set("socialError", "feature_not_enabled");
    return NextResponse.redirect(settingsUrl);
  }

  const auth = await requireOwnerTenantWriteAccess(parsedState.businessSlug);
  if (!auth.success || auth.session.user.id !== parsedState.userId) {
    settingsUrl.searchParams.set("socialError", "unauthorized");
    return NextResponse.redirect(settingsUrl);
  }

  if (!code) {
    settingsUrl.searchParams.set("socialError", "missing_code");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const token = await exchangeCodeForMetaUserToken(code);
    const pages = await getManagedMetaPages(token.access_token);

    if (pages.length === 0) {
      settingsUrl.searchParams.set("socialError", "no_pages_found");
      return NextResponse.redirect(settingsUrl);
    }

    const selectedPage = pages[0];
    const encryptedPageToken = encryptToken(selectedPage.access_token);
    const tokenExpiresAt =
      typeof token.expires_in === "number"
        ? new Date(Date.now() + token.expires_in * 1000)
        : null;

    const business = await prisma.business.findUnique({
      where: { slug: parsedState.businessSlug },
      select: { id: true },
    });

    if (!business) {
      settingsUrl.searchParams.set("socialError", "business_not_found");
      return NextResponse.redirect(settingsUrl);
    }

    await prisma.$transaction(async (tx) => {
      await tx.socialConnection.upsert({
        where: {
          business_id_platform: {
            business_id: business.id,
            platform: "FACEBOOK_PAGE",
          },
        },
        create: {
          business_id: business.id,
          platform: "FACEBOOK_PAGE",
          external_account_id: selectedPage.id,
          display_name: selectedPage.name,
          username: null,
          access_token_encrypted: encryptedPageToken,
          token_expires_at: tokenExpiresAt,
          status: "CONNECTED",
          last_sync_at: new Date(),
        },
        update: {
          external_account_id: selectedPage.id,
          display_name: selectedPage.name,
          username: null,
          access_token_encrypted: encryptedPageToken,
          token_expires_at: tokenExpiresAt,
          status: "CONNECTED",
          last_sync_at: new Date(),
        },
      });

      if (selectedPage.instagram_business_account?.id) {
        await tx.socialConnection.upsert({
          where: {
            business_id_platform: {
              business_id: business.id,
              platform: "INSTAGRAM_BUSINESS",
            },
          },
          create: {
            business_id: business.id,
            platform: "INSTAGRAM_BUSINESS",
            external_account_id: selectedPage.instagram_business_account.id,
            display_name:
              selectedPage.instagram_business_account.name ||
              selectedPage.instagram_business_account.username ||
              selectedPage.name,
            username: selectedPage.instagram_business_account.username || null,
            access_token_encrypted: encryptedPageToken,
            token_expires_at: tokenExpiresAt,
            status: "CONNECTED",
            last_sync_at: new Date(),
          },
          update: {
            external_account_id: selectedPage.instagram_business_account.id,
            display_name:
              selectedPage.instagram_business_account.name ||
              selectedPage.instagram_business_account.username ||
              selectedPage.name,
            username: selectedPage.instagram_business_account.username || null,
            access_token_encrypted: encryptedPageToken,
            token_expires_at: tokenExpiresAt,
            status: "CONNECTED",
            last_sync_at: new Date(),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          entity_type: "SocialConnection",
          entity_id: business.id,
          action: "CONNECTED",
          actor_id: auth.session.user.id,
          actor_type: "USER",
          business_id: business.id,
          changes: {
            facebookPageId: selectedPage.id,
            instagramBusinessId:
              selectedPage.instagram_business_account?.id ?? null,
          },
        },
      });
    });

    settingsUrl.searchParams.set("socialConnected", "1");
    if (!selectedPage.instagram_business_account?.id) {
      settingsUrl.searchParams.set("socialWarning", "instagram_not_found");
    }
    return NextResponse.redirect(settingsUrl);
  } catch (error) {
    console.error("Failed to finish Meta OAuth callback:", error);
    settingsUrl.searchParams.set("socialError", "oauth_callback_failed");
    return NextResponse.redirect(settingsUrl);
  }
}
