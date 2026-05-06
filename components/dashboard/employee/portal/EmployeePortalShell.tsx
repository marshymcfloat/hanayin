"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * EmployeePortalShell — outer layout wrapper for the redesigned
 * employee dashboard.
 *
 * Three vertical bands rendered as siblings (no flex column at the
 * outer level so the sticky greeting can dominate the top):
 *
 *   1. greeting — full-width sticky band (the GreetingStrip handles
 *      its own sticky/compact behavior internally).
 *   2. heroKpi — KPI grid inside the centered max-w-7xl container.
 *   3. bento body (children) — variable bento grid.
 *
 * Optional `manager` slot below the bento for the floor-operations
 * band when staffProfile === MANAGER.
 *
 * The shell is its own scrolling container (h-full overflow-y-auto)
 * because the parent AppLayout wraps the page in overflow-hidden on
 * the sidebar shell (manager/owner) which kills position: sticky in
 * the document body. Internal scroll lets sticky work in both the
 * frontdesk shell (no sidebar) and the sidebar shell consistently.
 */
export interface EmployeePortalShellProps {
  greeting: React.ReactNode;
  heroKpi: React.ReactNode;
  /** Bento body content — pass cards here as children. */
  children: React.ReactNode;
  /** Optional manager-only band (queue board, bookings dialog). */
  manager?: React.ReactNode;
  className?: string;
}

export function EmployeePortalShell({
  greeting,
  heroKpi,
  children,
  manager,
  className,
}: EmployeePortalShellProps) {
  return (
    <div
      className={cn(
        "h-full overflow-y-auto overscroll-contain bg-background",
        className,
      )}
    >
      {/* Greeting — full-width sticky. The GreetingStrip itself owns
          the sticky positioning, the compact-on-scroll behavior, and
          the bg/border that appears once the user has scrolled. */}
      {greeting}

      <div className="mx-auto w-full max-w-7xl px-4 pb-7 pt-5 sm:px-6 sm:pb-9 sm:pt-6 lg:px-8 lg:pb-10">
        <div className="space-y-5 sm:space-y-6 lg:space-y-7">
          {heroKpi}
          <PortalBentoGrid>{children}</PortalBentoGrid>
          {manager ? (
            <section className="space-y-3 sm:space-y-4">
              <SectionDivider label="Floor operations" />
              {manager}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PortalBentoGrid                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The bento grid container. Children control their own column/row
 * spans via Tailwind classes (`md:col-span-2`, `xl:row-span-2`, etc.).
 *
 * Layout strategy:
 *   < md   → single column, every card flows full-width
 *   md     → 2 columns, default 1x1 spans (cards opt into wider via class)
 *   xl     → 12-column auto-rows grid for true bento asymmetry
 */
function PortalBentoGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:gap-4 lg:gap-5",
        "grid-cols-1",
        "md:grid-cols-2",
        "xl:grid-cols-12 xl:auto-rows-[minmax(140px,auto)]",
      )}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SectionDivider                                                             */
/* -------------------------------------------------------------------------- */

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
