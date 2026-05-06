import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface BusinessFacingSkeletonProps {
  variant?: "landing" | "services";
  className?: string;
}

/**
 * Loading skeleton for the BeautyFeel facing site. Approximates the
 * editorial layout the user lands into so the UI doesn't visually shift
 * after data loads.
 *
 *  - "landing": full-bleed dark hero → atmospheric strip → signature
 *    three-up → principles split → services menu list → final CTA
 *  - "services": full-bleed dark hero → mobile category strip → sticky
 *    rail + magazine-spread placeholders (image card + stanza rows)
 */
export default function BusinessFacingSkeleton({
  variant = "landing",
  className,
}: BusinessFacingSkeletonProps) {
  return (
    <main
      className={cn(
        "min-h-screen bg-[color:var(--bf-cream)] text-[color:var(--bf-ink)] [--bf-cream:oklch(0.98_0.01_92)] [--bf-ink:oklch(0.2_0.02_62)] [--bf-muted:oklch(0.52_0.02_75)] [--bf-blush:oklch(0.92_0.03_35)] [--bf-accent:oklch(0.86_0.08_38)] [--bf-sage:oklch(0.76_0.05_148)]",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading business profile…</span>

      {/* ── Header (transparent over hero, just shape) ── */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:h-20">
          <Skeleton className="h-5 w-28 rounded-md bg-white/25" />
          <div className="hidden items-center gap-6 md:flex">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-3 w-14 rounded-full bg-white/20" />
            ))}
          </div>
          <Skeleton className="h-9 w-20 rounded-full bg-white/30" />
        </div>
      </header>

      {/* ── Hero (full-bleed dark) ── */}
      <section className="relative min-h-[100svh] overflow-hidden bg-[color:var(--bf-ink)]/85">
        <div className="absolute inset-x-0 bottom-0 px-6 pb-12 pt-32 sm:px-10 sm:pb-16 lg:pb-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl space-y-5">
              <Skeleton className="h-3 w-44 rounded-full bg-white/20" />
              <div className="space-y-3">
                <Skeleton className="h-12 w-full max-w-[640px] rounded-md bg-white/15 sm:h-16 lg:h-20" />
                <Skeleton className="h-12 w-full max-w-[480px] rounded-md bg-white/15 sm:h-16 lg:h-20" />
              </div>
              <div className="space-y-2 pt-2">
                <Skeleton className="h-3.5 w-full max-w-[440px] rounded-full bg-white/15" />
                <Skeleton className="h-3.5 w-full max-w-[360px] rounded-full bg-white/15" />
              </div>
              <div className="flex flex-col gap-3 pt-3 sm:flex-row">
                <Skeleton className="h-12 w-full rounded-full bg-white/30 sm:w-44" />
                <Skeleton className="h-12 w-full rounded-full bg-white/15 sm:w-40" />
              </div>
            </div>
            {/* Quick facts row (only on landing) */}
            {variant === "landing" && (
              <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-6 border-t border-white/15 pt-6 sm:grid-cols-4 sm:gap-x-8">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-2.5 w-16 rounded-full bg-white/20" />
                    <Skeleton className="h-4 w-24 rounded-full bg-white/25" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {variant === "landing" ? <LandingBody /> : <ServicesBody />}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Landing body — atmospheric strip → signature three → principles → services */
/* → final CTA                                                                */
/* -------------------------------------------------------------------------- */

function LandingBody() {
  return (
    <>
      {/* Atmospheric strip */}
      <section className="border-y border-black/[0.06] bg-[color:var(--bf-blush)]/25">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-x-6 px-6 py-4">
          <Skeleton className="h-3 w-24 rounded-full bg-[color:var(--bf-blush)]/70" />
          <Skeleton className="size-1 rounded-full bg-[color:var(--bf-blush)]/50" />
          <Skeleton className="h-3 w-32 rounded-full bg-[color:var(--bf-blush)]/70" />
          <Skeleton className="size-1 rounded-full bg-[color:var(--bf-blush)]/50 hidden sm:block" />
          <Skeleton className="hidden h-3 w-28 rounded-full bg-[color:var(--bf-blush)]/70 sm:block" />
        </div>
      </section>

      {/* Signature three */}
      <section className="mx-auto max-w-7xl px-6 py-20 sm:py-28 lg:py-32">
        <div className="max-w-2xl space-y-4">
          <Skeleton className="h-3 w-40 rounded-full bg-[color:var(--bf-blush)]/70" />
          <Skeleton className="h-10 w-full max-w-[480px] rounded-md bg-[color:var(--bf-blush)]/50 sm:h-14" />
        </div>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:mt-14 sm:grid-cols-3 sm:gap-7">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className={cn("flex flex-col", i === 1 && "sm:mt-10")}
            >
              <Skeleton className="aspect-[4/5] w-full rounded-2xl bg-[color:var(--bf-blush)]/60" />
              <div className="mt-5 space-y-2">
                <Skeleton className="h-2.5 w-12 rounded-full bg-[color:var(--bf-blush)]/60" />
                <Skeleton className="h-7 w-40 rounded-md bg-[color:var(--bf-blush)]/50" />
                <Skeleton className="h-3 w-full rounded-full bg-[color:var(--bf-blush)]/40" />
                <Skeleton className="h-3 w-3/4 rounded-full bg-[color:var(--bf-blush)]/40" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Principles split */}
      <section className="border-y border-black/[0.06]">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 sm:py-28 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:py-32">
          <Skeleton className="aspect-[4/5] w-full rounded-2xl bg-[color:var(--bf-blush)]/55 sm:aspect-[3/4]" />
          <div className="space-y-6">
            <Skeleton className="h-3 w-56 rounded-full bg-[color:var(--bf-blush)]/70" />
            <Skeleton className="h-12 w-full max-w-[420px] rounded-md bg-[color:var(--bf-blush)]/50 sm:h-16" />
            <div className="space-y-2 pt-2">
              <Skeleton className="h-3 w-full max-w-[480px] rounded-full bg-[color:var(--bf-blush)]/45" />
              <Skeleton className="h-3 w-full max-w-[400px] rounded-full bg-[color:var(--bf-blush)]/45" />
            </div>
            <ol className="mt-8 space-y-9">
              {[...Array(3)].map((_, i) => (
                <li key={i} className="flex gap-5 sm:gap-7">
                  <Skeleton className="h-3 w-6 rounded-full bg-[color:var(--bf-accent)]/50" />
                  <div className="flex-1 space-y-2 border-t border-black/[0.08] pt-4">
                    <Skeleton className="h-6 w-3/4 rounded-md bg-[color:var(--bf-blush)]/55" />
                    <Skeleton className="h-3 w-full rounded-full bg-[color:var(--bf-blush)]/40" />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Services preview menu */}
      <section className="mx-auto max-w-7xl px-6 py-20 sm:py-28 lg:py-32">
        <div className="flex items-end justify-between gap-3">
          <div className="max-w-xl space-y-3">
            <Skeleton className="h-3 w-20 rounded-full bg-[color:var(--bf-blush)]/70" />
            <Skeleton className="h-10 w-full max-w-[420px] rounded-md bg-[color:var(--bf-blush)]/50 sm:h-14" />
          </div>
          <Skeleton className="h-4 w-24 rounded-full bg-[color:var(--bf-blush)]/55" />
        </div>
        <ul className="mt-10 divide-y divide-black/[0.08] border-y border-black/[0.08]">
          {[...Array(6)].map((_, i) => (
            <li
              key={i}
              className="flex items-baseline gap-4 py-5 sm:gap-6 sm:py-7"
            >
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-2/3 rounded-md bg-[color:var(--bf-blush)]/50" />
                <Skeleton className="h-3 w-3/4 rounded-full bg-[color:var(--bf-blush)]/35" />
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <Skeleton className="h-6 w-20 rounded-md bg-[color:var(--bf-blush)]/50" />
                <Skeleton className="h-2.5 w-12 rounded-full bg-[color:var(--bf-blush)]/40" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Final CTA placeholder */}
      <section className="bg-[color:var(--bf-ink)]/85">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20 lg:py-24">
          <div className="mx-auto inline-block space-y-4">
            <Skeleton className="mx-auto h-3 w-20 rounded-full bg-white/20" />
            <Skeleton className="h-12 w-72 rounded-md bg-white/15 sm:h-16 sm:w-[480px]" />
            <Skeleton className="mx-auto h-3 w-full max-w-[360px] rounded-full bg-white/15" />
          </div>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Skeleton className="h-11 w-44 rounded-full bg-white/25" />
            <Skeleton className="h-11 w-40 rounded-full bg-white/15" />
          </div>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Services body — mobile category strip → sticky rail + magazine spreads      */
/* -------------------------------------------------------------------------- */

function ServicesBody() {
  return (
    <>
      {/* Mobile category chips strip */}
      <section className="border-y border-black/[0.06] bg-[color:var(--bf-blush)]/25 lg:hidden">
        <div className="mx-auto max-w-7xl">
          <div className="flex gap-2 overflow-x-auto px-6 py-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton
                key={i}
                className="h-7 w-20 shrink-0 rounded-full bg-[color:var(--bf-blush)]/60"
              />
            ))}
          </div>
        </div>
      </section>

      {/* Menu — sticky rail + magazine spreads */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:grid lg:grid-cols-[200px_1fr] lg:gap-16 lg:py-24">
        {/* Sticky rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-32 space-y-3">
            <Skeleton className="h-3 w-20 rounded-full bg-[color:var(--bf-blush)]/70" />
            <ul className="space-y-1.5">
              {[...Array(4)].map((_, i) => (
                <li key={i} className="border-l border-black/[0.08] pl-4 py-1.5">
                  <Skeleton className="h-4 w-28 rounded-full bg-[color:var(--bf-blush)]/50" />
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Spreads */}
        <div className="space-y-24 sm:space-y-28 lg:space-y-36">
          {[...Array(3)].map((_, idx) => (
            <article key={idx}>
              <div
                className={cn(
                  "grid grid-cols-1 gap-8 sm:gap-10 lg:grid-cols-[5fr_7fr] lg:gap-14",
                  idx % 2 === 1 &&
                    "lg:[&>div:first-child]:order-2",
                )}
              >
                {/* Image card */}
                <div>
                  <Skeleton className="aspect-[16/10] w-full rounded-2xl bg-[color:var(--bf-blush)]/60 sm:aspect-[16/9] lg:aspect-[4/5]" />
                </div>
                {/* Stanza entries */}
                <div>
                  <ol className="space-y-12 sm:space-y-14">
                    {[...Array(3)].map((_, i) => (
                      <li key={i} className="flex items-baseline gap-4 sm:gap-6">
                        <Skeleton className="h-6 w-5 rounded-md bg-[color:var(--bf-accent)]/50" />
                        <div className="flex-1 space-y-3">
                          <div className="space-y-2">
                            <Skeleton className="h-7 w-2/3 rounded-md bg-[color:var(--bf-blush)]/55" />
                            <Skeleton className="h-2.5 w-16 rounded-full bg-[color:var(--bf-blush)]/40" />
                          </div>
                          <div className="space-y-1.5 pt-1">
                            <Skeleton className="h-3 w-full rounded-full bg-[color:var(--bf-blush)]/35" />
                            <Skeleton className="h-3 w-3/4 rounded-full bg-[color:var(--bf-blush)]/35" />
                          </div>
                          <div className="flex items-baseline justify-between gap-4 border-t border-black/[0.08] pt-4">
                            <Skeleton className="h-6 w-20 rounded-md bg-[color:var(--bf-blush)]/50" />
                            <Skeleton className="h-3 w-16 rounded-full bg-[color:var(--bf-blush)]/40" />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
