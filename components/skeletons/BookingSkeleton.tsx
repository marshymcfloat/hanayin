import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface BookingSkeletonProps {
  /** "beautyfeel" matches the editorial BeautyFeel booking layout
   *  (sticky cream header → blush hero strip → centered cream form panel).
   *  "default" matches the generic two-column public booking layout. */
  variant?: "default" | "beautyfeel";
  className?: string;
}

export default function BookingSkeleton({
  variant = "default",
  className,
}: BookingSkeletonProps) {
  if (variant === "beautyfeel") {
    return <BeautyFeelBookingSkeleton className={className} />;
  }
  return <DefaultBookingSkeleton className={className} />;
}

/* -------------------------------------------------------------------------- */
/* BeautyFeel — header → blush hero strip → centered form card                */
/* -------------------------------------------------------------------------- */

function BeautyFeelBookingSkeleton({ className }: { className?: string }) {
  return (
    <main
      className={cn(
        "min-h-screen bg-[color:var(--bf-cream)] text-[color:var(--bf-ink)] [--bf-cream:oklch(0.98_0.01_92)] [--bf-ink:oklch(0.2_0.02_62)] [--bf-muted:oklch(0.52_0.02_75)] [--bf-blush:oklch(0.92_0.03_35)] [--bf-accent:oklch(0.86_0.08_38)] [--bf-sage:oklch(0.76_0.05_148)]",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading booking…</span>

      {/* Cream sticky header (in scrolled state) */}
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-[color:var(--bf-cream)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:h-20">
          <Skeleton className="h-5 w-28 rounded-md bg-[color:var(--bf-blush)]/60" />
          <div className="hidden items-center gap-6 md:flex">
            {[...Array(3)].map((_, i) => (
              <Skeleton
                key={i}
                className="h-3 w-14 rounded-full bg-[color:var(--bf-blush)]/55"
              />
            ))}
          </div>
          <Skeleton className="h-9 w-20 rounded-full bg-[color:var(--bf-ink)]/85" />
        </div>
      </header>

      {/* Blush hero strip */}
      <section className="bg-[color:var(--bf-blush)]/30 pt-12 pb-10 sm:pt-16 sm:pb-12 lg:pt-20 lg:pb-14">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <Skeleton className="mx-auto h-3 w-44 rounded-full bg-[color:var(--bf-blush)]/70" />
          <div className="mt-5 space-y-3">
            <Skeleton className="mx-auto h-12 w-full max-w-[520px] rounded-md bg-[color:var(--bf-blush)]/55 sm:h-16" />
            <Skeleton className="mx-auto h-12 w-full max-w-[420px] rounded-md bg-[color:var(--bf-blush)]/55 sm:h-16" />
          </div>
          <div className="mx-auto mt-5 max-w-xl space-y-2">
            <Skeleton className="mx-auto h-3.5 w-full max-w-[480px] rounded-full bg-[color:var(--bf-blush)]/45" />
            <Skeleton className="mx-auto h-3.5 w-full max-w-[400px] rounded-full bg-[color:var(--bf-blush)]/45" />
          </div>
        </div>
      </section>

      {/* Form panel — cream card with placeholder rows */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <div className="rounded-2xl border border-black/[0.08] bg-[color:var(--bf-cream)] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.06)]">
          <div className="space-y-6 p-4 sm:space-y-8 sm:p-7">
            {/* Step header */}
            <div className="space-y-2">
              <Skeleton className="h-3 w-24 rounded-full bg-[color:var(--bf-blush)]/60" />
              <Skeleton className="h-7 w-2/3 rounded-md bg-[color:var(--bf-blush)]/45" />
            </div>
            {/* Service category chips */}
            <div className="flex flex-wrap gap-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-9 w-20 rounded-full bg-[color:var(--bf-blush)]/45"
                />
              ))}
            </div>
            {/* Service cards grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-24 w-full rounded-xl bg-[color:var(--bf-blush)]/40"
                />
              ))}
            </div>
            {/* Bottom action bar */}
            <div className="flex items-center justify-between border-t border-black/[0.06] pt-6">
              <Skeleton className="h-3 w-24 rounded-full bg-[color:var(--bf-blush)]/45" />
              <Skeleton className="h-11 w-32 rounded-full bg-[color:var(--bf-ink)]/80" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Default — generic two-column public booking layout                          */
/* -------------------------------------------------------------------------- */

function DefaultBookingSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col lg:flex-row min-h-screen w-full",
        className,
      )}
    >
      {/* Brand panel */}
      <div className="relative w-full lg:w-[45%] lg:min-h-screen bg-muted/30 border-b lg:border-b-0 lg:border-r p-8 lg:p-12 flex flex-col justify-between">
        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <Skeleton className="h-16 w-16 lg:h-20 lg:w-20 rounded-full" />
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 w-full bg-background p-4 md:p-8 lg:p-12 flex flex-col items-center justify-center">
        <div className="w-full max-w-xl space-y-8">
          <div className="space-y-6">
            <Skeleton className="h-10 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
