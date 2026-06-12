import { redirect } from "next/navigation";

import { requireTenantAccess } from "@/lib/auth/guards";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { isSocialPublishingEnabledForBusiness } from "@/lib/features/social-publishing";
import { isSocialPostRequestsEnabledForBusiness } from "@/lib/features/social-post-requests";
import { hasViewerPermission } from "@/lib/auth/viewer-permissions";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { SocialPostsPageClient } from "@/components/dashboard/owner/social-posts/SocialPostsPageClient";
import { RequestsInbox } from "@/components/dashboard/social-posts/RequestsInbox";
import { SuggestPostDialog } from "@/components/dashboard/social-posts/SuggestPostDialog";
import { parseGrowthFlowContext } from "@/components/dashboard/owner/growth/types";
import { getBusinessEntitlementsBySlug } from "@/lib/features/plan-entitlements";

export default async function SocialPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const flowContext = parseGrowthFlowContext(rawSearchParams);
  const auth = await requireTenantAccess(businessSlug);
  if (!auth.success) {
    redirect("/");
  }

  // Wave E E6: replace the strict OWNER-only fork with a permission-aware
  // tree. Owners and reviewers (SOCIAL_POST_REVIEW) see the full draft +
  // inbox view. Submitters (SOCIAL_POST_REQUEST_CREATE) see a redirect
  // hint to /my-requests. Everyone else sees an upsell card.
  const actor = await resolveTenantActorContext(
    businessSlug,
    auth.session.user.id,
  );
  if (!actor.success) {
    redirect("/");
  }

  // Build the viewer-context-shaped object explicitly per actor branch
  // so TypeScript can narrow the discriminated union; ternaries inside
  // the object literal don't preserve the narrowing across fields.
  const viewerLike =
    actor.actorType === "OWNER"
      ? {
          actorType: "OWNER" as const,
          role: actor.role,
          staffProfile: null,
          permissions: actor.permissions,
          businessId: actor.businessId,
          businessSlug: actor.businessSlug,
          userId: actor.userId,
          ownerId: actor.ownerId,
          employeeId: null,
        }
      : {
          actorType: "EMPLOYEE" as const,
          role: actor.role,
          staffProfile: actor.profile,
          permissions: actor.permissions,
          businessId: actor.businessId,
          businessSlug: actor.businessSlug,
          userId: actor.userId,
          ownerId: null,
          employeeId: actor.employeeId,
        };

  const isOwner = actor.actorType === "OWNER";
  const canReview = hasViewerPermission(
    viewerLike,
    StaffPermission.SOCIAL_POST_REVIEW,
  );
  const canSubmit = hasViewerPermission(
    viewerLike,
    StaffPermission.SOCIAL_POST_REQUEST_CREATE,
  );
  const requestsFeatureOn = isSocialPostRequestsEnabledForBusiness(businessSlug);

  // Non-owner non-reviewer with submit permission: route them to
  // /my-requests where they have a real surface, plus the SuggestPostDialog.
  if (!isOwner && !canReview) {
    if (!requestsFeatureOn || !canSubmit) {
      return (
        <div className="p-8 max-w-2xl mx-auto">
          <h1 className="text-xl font-semibold text-foreground">Social Posts</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Social publishing is managed by your owner. If you have an idea for
            a post, ask your owner to enable post requests for your account.
          </p>
        </div>
      );
    }
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-xl font-semibold text-foreground">Social Posts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Owners review every post before it goes live. You can suggest a post
          and your owner will draft + publish it.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <SuggestPostDialog businessSlug={businessSlug} />
          <a
            href={`/app/${businessSlug}/social-posts/my-requests`}
            className="inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            View my requests →
          </a>
        </div>
      </div>
    );
  }

  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.social) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-foreground">Social Posts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Social publishing is available on the Pro plan.
        </p>
      </div>
    );
  }

  if (!isSocialPublishingEnabledForBusiness(businessSlug)) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-foreground">Social Posts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Social publishing is currently enabled only for pilot businesses.
        </p>
      </div>
    );
  }

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      social_posts: {
        include: {
          sale_event: {
            select: {
              title: true,
              description: true,
              discount_type: true,
              discount_value: true,
              start_date: true,
              end_date: true,
            },
          },
          targets: {
            include: {
              social_connection: {
                select: {
                  platform: true,
                  display_name: true,
                },
              },
            },
            orderBy: { created_at: "asc" },
          },
        },
        orderBy: { created_at: "desc" },
      },
    },
  });

  if (!business) {
    redirect("/app");
  }

  // Reusable reference images from the brand-asset library. Owners attach one
  // to an image-generation request for visual consistency / person identity
  // preservation. Scoped to this business; kind=REFERENCE only.
  const referenceAssets = await prisma.brandAsset.findMany({
    where: { business_id: business.id, kind: "REFERENCE" },
    orderBy: { created_at: "desc" },
    select: { id: true, url: true, alt: true, reference_subject: true },
  });

  return (
    <div className="flex flex-col bg-background">
      {/* Wave E E6: when the request workflow is on AND the viewer can
          review (owner or SOCIAL_POST_REVIEW), render the team inbox
          above the existing draft list. The two surfaces share the same
          page so reviewers see new ideas first, then the drafts they're
          already managing. */}
      {requestsFeatureOn && canReview ? (
        <div className="px-4 sm:px-8 pt-4 sm:pt-6 max-w-7xl mx-auto w-full">
          <RequestsInbox businessSlug={businessSlug} />
        </div>
      ) : null}

      <SocialPostsPageClient
        businessSlug={businessSlug}
        businessName={business.name}
        businessImageUrl={business.imageUrl}
        initialPosts={business.social_posts}
        referenceAssets={referenceAssets}
        flowContext={flowContext}
      />
    </div>
  );
}
