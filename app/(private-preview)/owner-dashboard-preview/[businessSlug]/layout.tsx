import type { ReactNode } from "react";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/features/auth/auth-options";
import { getVerifiedOwnerPreviewBusinessName } from "@/features/businesses/queries/owner-preview";
import { resolveTenantActorContext } from "@/lib/auth/staff-access";
import { resolveOwnerPreviewAccess } from "@/components/dashboard/owner-preview/access";
import { OwnerPreviewLayoutShell } from "@/components/dashboard/owner-preview/OwnerPreviewLayoutShell";
import { OwnerPreviewQueryProvider } from "@/components/dashboard/owner-preview/OwnerPreviewQueryProvider";

export default function OwnerDashboardPreviewLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <Suspense fallback={<OwnerPreviewLayoutFallback />}>
      <OwnerPreviewLayoutContent params={params}>{children}</OwnerPreviewLayoutContent>
    </Suspense>
  );
}

function OwnerPreviewLayoutFallback() {
  return (
    <div className="min-h-dvh bg-[#F5F6F3]" aria-busy="true" aria-label="Loading owner workspace">
      <span className="sr-only">Loading owner workspace</span>
      <div aria-hidden="true" className="fixed inset-y-5 left-5 hidden w-[88px] rounded-[48px] bg-[#20211F] md:block" />
      <main aria-hidden="true" className="mx-auto max-w-[1680px] animate-pulse space-y-6 px-5 pb-28 pt-10 md:pl-[128px] md:pr-10">
        <div className="h-4 w-28 rounded-full bg-[#DFE2DC]" />
        <div className="space-y-3">
          <div className="h-10 w-64 max-w-full rounded-2xl bg-white" />
          <div className="h-4 w-80 max-w-full rounded-full bg-[#E6E9E3]" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-36 rounded-[28px] bg-white" />
          ))}
        </div>
        <div className="h-80 rounded-[32px] bg-white" />
      </main>
      <div aria-hidden="true" className="fixed inset-x-5 bottom-5 h-16 rounded-full bg-[#20211F] md:hidden" />
    </div>
  );
}

async function OwnerPreviewLayoutContent({ children, params }: { children: ReactNode; params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const session = await getServerSession(authOptions);
  const access = resolveOwnerPreviewAccess({
    authenticated: Boolean(session?.user),
    role: session?.user?.role,
    sessionBusinessSlug: session?.user?.businessSlug,
    requestedBusinessSlug: businessSlug,
  });
  if (!access.allowed) redirect(access.redirectTo);
  if (!session?.user?.id) redirect("/");

  const owner = await resolveTenantActorContext(businessSlug, session.user.id);
  if (!owner.success || owner.actorType !== "OWNER") redirect("/");
  const business = await getVerifiedOwnerPreviewBusinessName(owner);
  if (!business) redirect("/");

  const identity = {
    userId: owner.userId,
    businessId: owner.businessId,
    businessSlug: owner.businessSlug,
    businessName: business.name,
    ownerName: session.user.name || "Owner",
  };

  return (
    <OwnerPreviewQueryProvider key={`${identity.userId}:${identity.businessId}:${identity.businessSlug}`} identity={identity}>
      <OwnerPreviewLayoutShell businessSlug={businessSlug}>{children}</OwnerPreviewLayoutShell>
    </OwnerPreviewQueryProvider>
  );
}
