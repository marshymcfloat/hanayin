import { redirect } from "next/navigation";

import { requireTenantAccess } from "@/lib/auth/guards";
import { isSocialPublishingEnabledForBusiness } from "@/lib/features/social-publishing";
import { prisma } from "@/prisma/prisma";
import { SocialPostsPageClient } from "@/components/dashboard/owner/social-posts/SocialPostsPageClient";
import { PageHeader } from "@/components/dashboard/PageHeader";
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

  if (auth.session.user.role !== "OWNER") {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-zinc-900">Social Posts</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Only owners can access social publishing.
        </p>
      </div>
    );
  }

  const entitlements = await getBusinessEntitlementsBySlug(businessSlug);
  if (!entitlements.social) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-zinc-900">Social Posts</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Social publishing is available on the Pro plan.
        </p>
      </div>
    );
  }

  if (!isSocialPublishingEnabledForBusiness(businessSlug)) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-zinc-900">Social Posts</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Social publishing is currently enabled only for pilot businesses.
        </p>
      </div>
    );
  }

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: {
      id: true,
      social_posts: {
        include: {
          sale_event: { select: { title: true } },
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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Social Posts"
        description="Review, edit, publish, and retry channel posts from your sale events."
      />
      <SocialPostsPageClient
        businessSlug={businessSlug}
        initialPosts={business.social_posts}
        flowContext={flowContext}
      />
    </div>
  );
}
