import Link from "next/link";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ShieldCheck, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { PlatformSignOutButton } from "@/components/auth/PlatformSignOutButton";
import { authOptions } from "@/features/auth/auth-options";
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
  { href: "/platform/payroll-rules", label: "Payroll rules", icon: "audit" },
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
    <main className="min-h-screen bg-background text-foreground font-sans">
      <PlatformToastManager />

      <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-background/85 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                <LayoutDashboard className="size-4" />
              </span>
              <div className="leading-tight">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Platform Admin
                </p>
                <h1 className="text-base font-semibold tracking-[-0.01em] text-foreground sm:text-[17px]">
                  ServiceFlow
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden md:inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 ring-1 ring-inset ring-primary/15">
                <div className="size-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[11px] font-medium tabular-nums text-primary">
                  {session.user.contactNumber}
                </span>
              </div>
              <PlatformSignOutButton className="h-9 rounded-full border border-black/[0.06] bg-card px-3 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors" />
            </div>
          </div>

          <div className="py-2 overflow-x-auto no-scrollbar">
            <PlatformNav items={platformNav} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section className="mb-8 rounded-3xl border border-black/[0.06] bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-16px_rgba(0,0,0,0.06)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3 max-w-2xl">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                <ShieldCheck className="size-4" />
              </span>
              <div className="leading-tight">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Today
                </p>
                <h2 className="mt-0.5 text-base font-semibold tracking-[-0.01em] text-foreground sm:text-[17px]">
                  Admin command center
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Manage platform growth, billing reliability, and account
                  health from one place.
                </p>
              </div>
            </div>
            <Link
              href="/platform/audit"
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-black/[0.06] bg-card px-3 text-xs font-medium text-foreground transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <ShieldCheck className="size-3.5" />
              Audit trail
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
