import { redirect } from "next/navigation";

import { requireTenantAccess } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { isSocialPostRequestsEnabledForBusiness } from "@/lib/features/social-post-requests";
import { listSocialPostRequestsAction } from "@/lib/server actions/social-post-requests";
import { hasViewerPermission } from "@/lib/auth/viewer-permissions";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { MyRequestsPageClient } from "@/components/dashboard/social-posts/MyRequestsPageClient";

/**
 * Wave E E8: requester's "My Requests" page.
 *
 * Anyone with SOCIAL_POST_REQUEST_CREATE can land here and see the
 * requests they've submitted. Owners + reviewers see their own
 * submissions only on this page; the cross-team inbox lives at the
 * main social-posts route.
 *
 * The list is server-fetched so the page loads with data already in
 * place. The client component below handles edit / cancel actions.
 */

export default async function MyRequestsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;

  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) {
    redirect("/");
  }

  if (!isSocialPostRequestsEnabledForBusiness(businessSlug)) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-foreground">My Requests</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Post requests aren&apos;t enabled for this business yet.
        </p>
      </div>
    );
  }

  const actor = await resolveTenantActorContext(
    businessSlug,
    auth.session.user.id,
  );
  if (!actor.success) {
    redirect("/");
  }

  // The page is allowed for anyone with SOCIAL_POST_REQUEST_CREATE.
  // Owners pass through automatically. Branch explicitly on actorType
  // so TypeScript can narrow the discriminated union safely.
  let allowed = false;
  if (actor.actorType === "OWNER") {
    allowed = true;
  } else {
    allowed = hasViewerPermission(
      {
        actorType: "EMPLOYEE",
        role: actor.role,
        staffProfile: actor.profile,
        permissions: actor.permissions,
        businessId: actor.businessId,
        businessSlug: actor.businessSlug,
        userId: actor.userId,
        ownerId: null,
        employeeId: actor.employeeId,
      },
      StaffPermission.SOCIAL_POST_REQUEST_CREATE,
    );
  }

  if (!allowed) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-foreground">My Requests</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to suggest posts. Ask your owner to enable
          this for your account.
        </p>
      </div>
    );
  }

  const list = await listSocialPostRequestsAction({
    businessSlug,
    scope: "MINE",
    limit: 100,
  });

  if (!list.success) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-foreground">My Requests</h1>
        <p className="mt-2 text-sm text-destructive">{list.error}</p>
      </div>
    );
  }

  return (
    <MyRequestsPageClient
      businessSlug={businessSlug}
      initialRequests={list.requests}
    />
  );
}
