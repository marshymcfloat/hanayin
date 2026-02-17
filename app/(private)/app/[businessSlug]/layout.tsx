import { AppSidebar } from "@/components/dashboard/AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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

  if (isFrontdeskShell) {
    return (
      <div className="bg-background min-h-screen ">
        {showReadOnlyBanner ? (
          <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            {readOnlyMessage}
          </div>
        ) : null}
        {children}
        {modal}
      </div>
    );
  }

  return (
    <div className="bg-background">
      <SidebarProvider>
        <React.Suspense fallback={<SidebarSkeleton />}>
          <AppSidebar />
        </React.Suspense>
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b bg-white px-4 lg:hidden">
            <SidebarTrigger className="h-8 w-8" />
            <span className="font-semibold">Menu</span>
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
