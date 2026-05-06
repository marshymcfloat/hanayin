import { getServerSession } from "next-auth";
import { prisma } from "@/prisma/prisma";

import { authOptions } from "@/lib/next auth/options";
import { SidebarSkeleton } from "./SidebarSkeleton";
import { AppSidebarClient } from "./AppSidebarClient";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";
import {
  hasStaffPermission,
  resolveTenantActorContext,
} from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";

export async function AppSidebar() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return <SidebarSkeleton />;
  }

  const { name, email, role } = session.user;
  let slug = session.user.businessSlug;

  // Fallback: If slug is missing in session (e.g. old session), try to fetch it
  if (!slug) {
    const userWithBusiness = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        employee: { include: { business: true } },
        owner: { include: { business: true } },
      },
    });

    slug =
      userWithBusiness?.employee?.business.slug ??
      userWithBusiness?.owner?.business.slug;
  }

  // Final fallback
  if (!slug) {
    slug = "demo";
  }

  const entitlements = await getBusinessEntitlementsBySlug(slug);
  let capabilities = {
    isOwner: role === "OWNER",
    canManageCatalog: role === "OWNER",
    canQueueOverride: role === "OWNER",
    // Owners always reach social posts when entitled; non-owners need
    // an explicit grant. Non-actor fallback keeps the sidebar usable
    // before the actor context resolves.
    canAccessSocialPosts: role === "OWNER",
  };

  const actorContext = await resolveTenantActorContext(slug, session.user.id);
  if (actorContext.success) {
    const canReviewSocialPost = hasStaffPermission(
      actorContext,
      StaffPermission.SOCIAL_POST_REVIEW,
    );
    const canSubmitSocialPost = hasStaffPermission(
      actorContext,
      StaffPermission.SOCIAL_POST_REQUEST_CREATE,
    );
    capabilities = {
      isOwner: actorContext.actorType === "OWNER",
      canManageCatalog: hasStaffPermission(
        actorContext,
        StaffPermission.CATALOG_MANAGE,
      ),
      canQueueOverride: hasStaffPermission(
        actorContext,
        StaffPermission.QUEUE_OVERRIDE_ALL,
      ),
      // Owners always pass; non-owners need at least one of the two
      // social-post flags. Either flag lands them on a usable page —
      // reviewers see the team inbox, submitters get redirected to
      // /my-requests with the SuggestPostDialog.
      canAccessSocialPosts:
        actorContext.actorType === "OWNER" ||
        canReviewSocialPost ||
        canSubmitSocialPost,
    };
  }

  return (
    <AppSidebarClient
      businessSlug={slug}
      entitlements={entitlements}
      capabilities={capabilities}
      user={{
        name: name || "User",
        email: email || "",
        role: role || "EMPLOYEE",
      }}
    />
  );
}
