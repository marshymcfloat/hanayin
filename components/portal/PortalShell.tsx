"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * PortalShell — shared outer layout for any portal-style surface in
 * the app (employee dashboard, customer booking page, future portals).
 *
 * Three vertical bands rendered as siblings:
 *   1. greeting — full-width sticky band (the slot's component owns
 *      the sticky/compact behavior internally).
 *   2. heroKpi — KPI grid inside the centered max-w-7xl container.
 *   3. bento body (children) — variable bento grid.
 *
 * Optional `manager` slot below the bento for staff/operations bands.
 *
 * Page-level scroll. We do NOT set overflow on the shell — natural
 * document scroll handles tall content, and the GreetingStrip
 * resolves its own scrolling ancestor at runtime so sticky works
 * regardless of which shell wraps the page.
 *
 * History: extracted from EmployeePortalShell so the public booking
 * page can reuse the same chrome without duplicating recipes. The
 * employee shell now re-exports from here.
 */
export interface PortalShellProps {
  greeting: React.ReactNode;
  /**
   * Optional KPI strip rendered above the bento. The employee dashboard
   * always supplies one; the public booking page intentionally omits it
   * (the form's own per-slot capacity already covers the customer-useful
   * info, and an aggregate strip leaks staffing pressure to scrapers).
   */
  heroKpi?: React.ReactNode;
  /** Bento body content — pass cards here as children. */
  children: React.ReactNode;
  /** Optional secondary band rendered below the bento. */
  manager?: React.ReactNode;
  /** Label for the divider above the manager band. Defaults to "Floor operations". */
  managerLabel?: string;
  className?: string;
}

export function PortalShell({
  greeting,
  heroKpi,
  children,
  manager,
  managerLabel = "Floor operations",
  className,
}: PortalShellProps) {
  return (
    <div className={cn("min-h-full bg-background", className)}>
      {/* Greeting — full-width sticky. The slot's component owns the
          sticky positioning, the compact-on-scroll behavior, and the
          bg/border that appears once the user has scrolled. */}
      {greeting}

      <div className="mx-auto w-full max-w-7xl px-4 pb-7 pt-5 sm:px-6 sm:pb-9 sm:pt-6 lg:px-8 lg:pb-10">
        <div className="space-y-5 sm:space-y-6 lg:space-y-7">
          {heroKpi ?? null}
          <PortalBentoGrid>{children}</PortalBentoGrid>
          {manager ? (
            <section className="space-y-3 sm:space-y-4">
              <SectionDivider label={managerLabel} />
              {manager}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The bento grid container. Children control their own column/row
 * spans via Tailwind classes (`md:col-span-2`, `xl:row-span-2`, etc.).
 *
 * Layout strategy:
 *   < md   → single column, every card flows full-width
 *   md     → 2 columns, default 1x1 spans (cards opt into wider via class)
 *   xl     → 12-column auto-rows grid for true bento asymmetry
 */
export function PortalBentoGrid({ children }: { children: React.ReactNode }) {
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

export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
