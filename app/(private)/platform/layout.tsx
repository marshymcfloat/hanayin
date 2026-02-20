import Link from "next/link";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ShieldCheck, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { PlatformSignOutButton } from "@/components/auth/PlatformSignOutButton";
import { authOptions } from "@/lib/next auth/options";
import { PlatformNav, type PlatformNavItem } from "./_components/platform-nav";
import {
  PlatformShellSkeleton,
  PlatformTabContentSkeleton,
} from "./_components/platform-loading";
import { PlatformToastManager } from "./_components/platform-toast-manager";

export const metadata: Metadata = {
  title: "Platform Admin",
  robots: {
    index: false,
    follow: false,
  },
};

const platformNav: PlatformNavItem[] = [
  { href: "/platform", label: "Overview", icon: "overview" },
  {
    href: "/platform/applications",
    label: "Applications",
    icon: "applications",
  },
  { href: "/platform/businesses", label: "Businesses", icon: "businesses" },
  { href: "/platform/outbox", label: "Outbox", icon: "outbox" },
  { href: "/platform/plans", label: "Plans", icon: "plans" },
  { href: "/platform/invoices", label: "Invoices", icon: "invoices" },
  { href: "/platform/referrals", label: "Referrals", icon: "referrals" },
  { href: "/platform/audit", label: "Audit", icon: "audit" },
];

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<PlatformShellSkeleton />}>
      <PlatformLayoutInner>{children}</PlatformLayoutInner>
    </Suspense>
  );
}

async function PlatformLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/");
  }
  if (session.user.role !== "PLATFORM_ADMIN") {
    redirect(
      session.user.businessSlug ? `/app/${session.user.businessSlug}` : "/",
    );
  }

  return (
    <main className="min-h-screen bg-stone-50/50 text-stone-900 font-sans">
      <PlatformToastManager />

      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-stone-900 leading-none">
                  ServiceFlow
                </h1>
                <p className="text-[10px] font-medium text-stone-500 uppercase tracking-wider">
                  Platform Admin
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100 border border-stone-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-stone-600">
                  {session.user.email}
                </span>
              </div>
              <PlatformSignOutButton className="h-8 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 hover:bg-stone-50 hover:text-stone-900 transition-colors" />
            </div>
          </div>

          <div className="py-2 overflow-x-auto no-scrollbar">
            <PlatformNav items={platformNav} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl space-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-stone-900">
                Admin Command Center
              </h2>
              <p className="text-sm text-stone-500">
                Manage platform growth, billing reliability, and account health
                from one place.
              </p>
            </div>
            <Link
              href="/platform/audit"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 transition hover:bg-stone-50 hover:border-stone-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              View Audit Trail
            </Link>
          </div>
        </section>

        <Suspense fallback={<PlatformTabContentSkeleton />}>
          {children}
        </Suspense>
      </div>
    </main>
  );
}
