import { redirect } from "next/navigation";

import { requireTenantAccess } from "@/lib/auth/guards";
import { isSocialPublishingEnabledForBusiness } from "@/lib/features/social-publishing";
import { prisma } from "@/prisma/prisma";
import { SocialPostsPageClient } from "@/components/dashboard/owner/social-posts/SocialPostsPageClient";
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
        <h1 className="text-xl font-semibold text-foreground">Social Posts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners can access social publishing.
        </p>
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

  return (
    <SocialPostsPageClient
      businessSlug={businessSlug}
      businessName={business.name}
      businessImageUrl={business.imageUrl}
      initialPosts={business.social_posts}
      flowContext={flowContext}
    />
  );
}
