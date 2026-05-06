"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * EmployeePortalShell — outer layout wrapper for the redesigned
 * employee dashboard. Three vertical bands:
 *
 *   1. greeting (slot)
 *   2. heroKpi (slot)
 *   3. bento body (children) — variable bento grid
 *
 * Optional `manager` slot below the bento for the floor-operations
 * band when staffProfile === MANAGER.
 *
 * Container width tracks the marketing site (max-w-7xl) so the portal
 * sits comfortably alongside the rest of the app. Page padding scales
 * by breakpoint; mobile uses 16px gutters, tablet 24px, desktop 32px.
 *
 * The shell scrolls the *page*, not an internal flex column. That's a
 * deliberate departure from the old portal which wrapped everything
 * in `flex h-full overflow-hidden` — that pattern fights mobile chrome
 * and made the bento grid a no-go. With page-level scroll we get
 * normal browser behavior, sticky sidebars, and `overscroll-contain`
 * cleanly inside individual cards.
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
    <div className={cn("min-h-full bg-background", className)}>
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-9">
        <div className="space-y-5 sm:space-y-6 lg:space-y-7">
          {greeting}
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
 *
 * Auto-rows on xl mean varied card heights stack predictably; cards
 * that need extra height set `xl:row-span-2`.
 */
function PortalBentoGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:gap-4 lg:gap-5",
        "grid-cols-1",
        "md:grid-cols-2",
        "xl:grid-cols-12 xl:auto-rows-[minmax(140px,auto)]",
        // items-start so cards size to their own content rather than
        // stretching to match the tallest sibling in their row. Without
        // this a short card next to a tall card shows empty space —
        // the project preference is "no nested cards" + "no orphan
        // padding inside cards", so we keep cards lean and let the
        // grid breathe naturally.
        "items-start",
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
