import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * EmployeeDashboardSkeleton — loading shell for the employee portal.
 *
 * Mirrors the live layout exactly so the page doesn't visually jump
 * when data resolves:
 *   1. Greeting strip (avatar + heading + salary pill + 3 action buttons)
 *   2. KPI grid (1 primary-tinted hero tile + 3 neutral tiles)
 *   3. Bento grid (Attendance + Leaves on row 1, MyBookings spans wide,
 *      Pending + Served paired on the bottom row at xl)
 *
 * No card-in-a-card chrome — placeholders use the same hairline border
 * + soft shadow as PortalCard. The hero KPI uses a primary/15 tint to
 * pre-render the color landing zone.
 */
export default function EmployeeDashboardSkeleton() {
  return (
    <div className="min-h-full bg-background">
      {/* ── Greeting strip ─────────────────────────────────── */}
      <div className="border-b border-transparent">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-7 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3 sm:gap-x-4">
            <div className="flex grow items-center gap-3 sm:gap-4">
              <Skeleton className="size-11 shrink-0 rounded-full sm:size-12" />
              <div className="min-w-0 space-y-2 leading-tight">
                <Skeleton className="h-6 w-44 rounded-md sm:h-7 sm:w-56" />
                <Skeleton className="h-3 w-24 rounded-full" />
              </div>
            </div>
            <div className="flex shrink-0 basis-full items-center justify-between gap-3 sm:basis-auto sm:gap-3">
              <Skeleton className="h-8 w-24 rounded-full bg-primary/10" />
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Skeleton className="size-10 shrink-0 rounded-full bg-primary/15" />
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <Skeleton className="size-10 shrink-0 rounded-full bg-primary/15" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pb-7 sm:px-6 sm:pb-9 lg:px-8 lg:pb-10">
        <div className="space-y-5 sm:space-y-6 lg:space-y-7">
          {/* ── KPI grid ────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {/* Hero — primary tinted to pre-render the green landing zone */}
            <div className="col-span-2 rounded-3xl bg-primary/15 p-5 sm:p-6 md:col-span-1">
              <div className="flex items-start justify-between gap-2">
                <Skeleton className="h-3 w-32 rounded-full bg-primary/20" />
                <Skeleton className="size-8 rounded-xl bg-primary/25" />
              </div>
              <Skeleton className="mt-5 h-10 w-36 rounded-md bg-primary/25" />
              <Skeleton className="mt-3 h-3 w-40 rounded-full bg-primary/20" />
            </div>

            {/* Three neutral tiles */}
            {[...Array(3)].map((_, i) => (
              <KpiTileSkel key={i} className={i === 2 ? "col-span-2 md:col-span-1" : undefined} />
            ))}
          </div>

          {/* ── Bento body ──────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:gap-5 md:grid-cols-2 xl:auto-rows-[minmax(140px,auto)] xl:grid-cols-12">
            {/* Attendance */}
            <BentoCardSkel className="md:col-span-1 xl:col-span-4">
              <div className="flex items-start justify-between gap-3">
                <CardHeaderSkel iconOnly />
                <Skeleton className="size-8 shrink-0 rounded-full" />
              </div>
              <div className="mt-4 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28 rounded-full" />
              </div>
              <Skeleton className="mt-5 h-12 w-full rounded-xl bg-primary/20" />
            </BentoCardSkel>

            {/* Leaves — empty-state shape */}
            <BentoCardSkel className="md:col-span-1 xl:col-span-4">
              <CardHeaderSkel />
              <div className="mt-4 flex h-full flex-col items-center justify-center gap-3 py-2 text-center">
                <Skeleton className="size-12 rounded-2xl bg-primary/15" />
                <div className="space-y-1.5">
                  <Skeleton className="mx-auto h-4 w-32" />
                  <Skeleton className="mx-auto h-3 w-48 rounded-full" />
                </div>
                <Skeleton className="h-9 w-36 rounded-full bg-primary/20" />
              </div>
            </BentoCardSkel>

            {/* My bookings — wide */}
            <BentoCardSkel className="md:col-span-2 xl:col-span-4">
              <CardHeaderSkel />
              <ListRowsSkel rows={3} />
            </BentoCardSkel>

            {/* Pending services — wider */}
            <BentoCardSkel className="md:col-span-2 xl:col-span-7">
              <div className="mb-2 flex items-start justify-between gap-3">
                <CardHeaderSkel />
                <Skeleton className="h-7 w-20 rounded-full" />
              </div>
              <ListRowsSkel rows={4} />
            </BentoCardSkel>

            {/* Served history */}
            <BentoCardSkel className="md:col-span-2 xl:col-span-5">
              <CardHeaderSkel />
              <ListRowsSkel rows={3} />
            </BentoCardSkel>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton primitives                                                        */
/* -------------------------------------------------------------------------- */

function KpiTileSkel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-black/[0.06] bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-3 w-20 rounded-full" />
        <Skeleton className="size-8 rounded-xl bg-primary/15" />
      </div>
      <Skeleton className="mt-5 h-10 w-16 rounded-md" />
      <Skeleton className="mt-3 h-3 w-28 rounded-full" />
    </div>
  );
}

function BentoCardSkel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-black/[0.06] bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-16px_rgba(0,0,0,0.06)] sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardHeaderSkel({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="size-9 shrink-0 rounded-xl bg-primary/15" />
      {iconOnly ? null : (
        <div className="flex-1 space-y-1.5 pt-0.5">
          <Skeleton className="h-2.5 w-16 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      )}
    </div>
  );
}

function ListRowsSkel({ rows }: { rows: number }) {
  return (
    <ul className="-mx-2 mt-3 divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center justify-between gap-3 px-2 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full bg-primary/15" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44 rounded-full" />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14 rounded-full bg-primary/15" />
          </div>
        </li>
      ))}
    </ul>
  );
}
