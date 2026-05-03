import { AppSidebar } from "@/components/dashboard/AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Sparkles } from "lucide-react";
import { SidebarSkeleton } from "@/components/dashboard/SidebarSkeleton";
import React from "react";
import { Metadata } from "next";
import { prisma } from "@/prisma/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/next auth/options";
import { redirect } from "next/navigation";

import { connection } from "next/server";
import { getTenantAccessState } from "@/features/billing/subscription-service";
import {
  hasStaffPermission,
  resolveTenantActorContext,
} from "@/lib/auth/staff-access";
import { StaffPermission } from "@/prisma/generated/prisma/enums";
import {
  ViewerContextProvider,
  type ViewerContextValue,
} from "@/lib/auth/viewer-context";

type Props = {
  children: React.ReactNode;
  modal: React.ReactNode;
  params: Promise<{ businessSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { businessSlug } = await params;

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { name: true },
  });

  return {
    title: business?.name || "Dashboard",
    robots: {
      index: false,
      follow: false,
    },
  };
}

async function AppLayoutContent({
  children,
  modal,
  businessSlug,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
  businessSlug: string;
}) {
  await connection();
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/");
  }

  if (session.user.role === "PLATFORM_ADMIN") {
    redirect("/platform");
  }

  if (session.user.businessSlug && session.user.businessSlug !== businessSlug) {
    redirect(`/app/${session.user.businessSlug}`);
  }

  const accessState = await getTenantAccessState(businessSlug);
  const showReadOnlyBanner = accessState.exists && accessState.readOnly;
  const readOnlyMessage =
    "Subscription is in read-only mode. Billing is still available while new mutations are blocked.";
  const actorContext = await resolveTenantActorContext(
    businessSlug,
    session.user.id,
  );
  if (!actorContext.success) {
    redirect("/");
  }
  const canUseSidebarShell = hasStaffPermission(
    actorContext,
    StaffPermission.CATALOG_MANAGE,
  );
  const isFrontdeskShell =
    actorContext.actorType === "EMPLOYEE" && !canUseSidebarShell;

  // Serializable snapshot for the client-side viewer context. The
  // actorContext from resolveTenantActorContext contains server-only
  // fields (Prisma types); we strip to a plain shape that can cross the
  // server/client boundary and feed it to the rest of the dashboard.
  const viewerValue: ViewerContextValue =
    actorContext.actorType === "OWNER"
      ? {
          actorType: "OWNER",
          role: actorContext.role,
          staffProfile: null,
          permissions: actorContext.permissions,
          businessId: actorContext.businessId,
          businessSlug: actorContext.businessSlug,
          userId: actorContext.userId,
          ownerId: actorContext.ownerId,
          employeeId: null,
        }
      : {
          actorType: "EMPLOYEE",
          role: actorContext.role,
          staffProfile: actorContext.profile,
          permissions: actorContext.permissions,
          businessId: actorContext.businessId,
          businessSlug: actorContext.businessSlug,
          userId: actorContext.userId,
          ownerId: null,
          employeeId: actorContext.employeeId,
        };

  if (isFrontdeskShell) {
    return (
      <ViewerContextProvider value={viewerValue}>
        <div className="bg-background min-h-screen ">
          {showReadOnlyBanner ? (
            <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              {readOnlyMessage}
            </div>
          ) : null}
          {children}
          {modal}
        </div>
      </ViewerContextProvider>
    );
  }

  return (
    <ViewerContextProvider value={viewerValue}>
      <div className="bg-background">
        <SidebarProvider>
          <React.Suspense fallback={<SidebarSkeleton />}>
            <AppSidebar />
          </React.Suspense>
          <SidebarInset>
            <header className="flex h-14 items-center gap-3 border-b border-border bg-white px-4 lg:hidden sticky top-0 z-30">
              <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors" />
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/30">
                  <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
                <span className="text-sm font-bold tracking-tight text-foreground truncate">ServiceFlow</span>
              </div>
            </header>
            {showReadOnlyBanner ? (
              <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                {readOnlyMessage}
              </div>
            ) : null}
            <div className="flex-1 min-h-0 overflow-hidden">
              {children}
              {modal}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </ViewerContextProvider>
  );
}

export default function AppLayout({
  children,
  modal,
  params,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <React.Suspense fallback={<SidebarSkeleton />}>
      <AppLayoutWithParams params={params} modal={modal}>
        {children}
      </AppLayoutWithParams>
    </React.Suspense>
  );
}

async function AppLayoutWithParams({
  children,
  modal,
  params,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  return (
    <AppLayoutContent businessSlug={businessSlug} modal={modal}>
      {children}
    </AppLayoutContent>
  );
}
