import Link from "next/link";
import { ArrowRight, MapPin, Search } from "lucide-react";
import Image from "next/image";
import { connection } from "next/server";
import { Suspense } from "react";
import { constructMetadata } from "@/lib/metadata";
import Schema from "@/components/seo/Schema";
import { itemListSchema } from "@/lib/json-ld";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";
import SmoothScroll from "@/components/landing/SmoothScroll";
import { listPublicDirectoryBusinesses } from "@/features/businesses/public-directory";

export const metadata = constructMetadata({
  title: "Explore Businesses | ServiceFlow",
  description:
    "Browse trusted local salons, spas, and barbershops on ServiceFlow. See real-time availability and book appointments directly with businesses across the Philippines.",
  image: "/og-image.png",
  canonical: "/explore",
  keywords: [
    "find salons in philippines",
    "book spa near me philippines",
    "discover barbershops online",
    "beauty services marketplace",
    "serviceflow business directory",
  ],
});

// Same noise SVG used on the home page for the green CTA. Keeps the
// brand "green moment" texture identical across pages.
const NOISE_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
  );

export default function ExplorePage() {
  return (
    <main className="min-h-screen bg-background font-sans flex flex-col overflow-x-clip">
      <SmoothScroll />
      <LandingHeader />

      {/* Hero — directory-style header, same visual language as home hero
          but trimmed: no parallax, no big mockup.
          NOTE: no `overflow-hidden` — the soft green spotlight is allowed
          to bleed gently into the business-grid section below for a
          continuous brand-color transition. The dot grid has its own mask
          so it doesn't leak. */}
      <section className="relative isolate pt-32 pb-12 sm:pt-40 sm:pb-16">
        {/* Dot grid (masked at the edges so it never leaks even without
            overflow-hidden on the parent). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black_40%,transparent_100%)]"
        />
        {/* Soft brand-green spotlight. Scales with viewport — smaller and
            tighter on mobile so the blur reads correctly at small sizes,
            wider on desktop. Horizontal clipping is handled by
            `overflow-x-clip` on the parent <main>. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-16 -z-10 h-[400px] w-[420px] -translate-x-1/2 rounded-full bg-primary/[0.12] blur-[100px] sm:h-[520px] sm:w-[680px] sm:blur-[120px] lg:h-[600px] lg:w-[900px] lg:blur-[140px]"
        />

        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">
            Directory
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-5xl lg:text-6xl">
            Live businesses on{" "}
            <span className="bg-gradient-to-br from-primary to-emerald-700 bg-clip-text text-transparent">
              ServiceFlow
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            Real salons, spas, and barbershops taking bookings right now.
            Tap any business to see their services and book in seconds.
          </p>
        </div>
      </section>

      {/* Business grid */}
      <section className="relative pb-20 sm:pb-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Suspense fallback={<BusinessListSkeleton />}>
            <BusinessList />
          </Suspense>
        </div>
      </section>

      {/* Bottom green moment — invites visitors to list their business */}
      <section className="relative overflow-hidden">
        <div className="relative bg-gradient-to-br from-primary via-emerald-700 to-emerald-900">
          <div
            aria-hidden
            style={{ backgroundImage: `url("${NOISE_SVG}")` }}
            className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/4 size-[600px] -translate-x-1/2 rounded-full bg-white/10 blur-[120px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,black_30%,transparent_100%)]"
          />

          <div className="relative mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28 lg:py-32 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100/80">
              For owners
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-white sm:text-4xl lg:text-5xl">
              Want your business listed here?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-emerald-50/90 sm:text-lg">
              Apply in minutes. We&apos;ll get you live and accepting
              bookings the same afternoon.
            </p>
            <div className="mt-9 flex justify-center">
              <Link
                href="/apply"
                className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-emerald-900 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] transition-all hover:bg-emerald-50 active:scale-[0.98]"
              >
                Apply now
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <LandingFooter />
      </Suspense>
    </main>
  );
}

async function BusinessList() {
  await connection();

  const businesses = await listPublicDirectoryBusinesses();

  if (businesses.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <Schema
        data={itemListSchema(
          businesses.map((business) => ({
            name: business.name,
            url: `/${business.slug}`,
            image: business.imageUrl ?? undefined,
            description: business.description ?? undefined,
          })),
        )}
      />
      <div className="mb-6 flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground tabular-nums">
          {businesses.length}{" "}
          {businesses.length === 1 ? "business" : "businesses"} live
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {businesses.map((business) => (
          <Link
            key={business.id}
            href={`/${business.slug}`}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-5 transition-all hover:border-black/[0.12] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)] sm:p-6"
          >
            {/* Avatar + name + meta row */}
            <div className="flex items-center gap-3">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-black/[0.05] bg-gradient-to-br from-primary/15 to-primary/5">
                {business.imageUrl ? (
                  <Image
                    src={business.imageUrl}
                    alt={business.name}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-primary">
                    {business.initials}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold tracking-[-0.01em] text-foreground">
                  {business.name}
                </h3>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3 shrink-0" />
                  <span>Philippines</span>
                  <span className="mx-1 text-muted-foreground/40">·</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-primary" />
                    Live
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="mt-4 min-h-[2.5em] text-sm leading-relaxed text-muted-foreground line-clamp-2">
              {business.description ||
                "A ServiceFlow business — accepting online bookings."}
            </p>

            {/* Footer row */}
            <div className="mt-5 flex items-center justify-between border-t border-black/[0.04] pt-4 text-sm">
              <span className="font-medium text-foreground/80 transition-colors group-hover:text-foreground">
                View profile
              </span>
              <span className="flex size-7 items-center justify-center rounded-full bg-zinc-50 text-foreground/60 transition-all group-hover:bg-foreground group-hover:text-background">
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/[0.08] bg-zinc-50/40 px-6 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border border-black/[0.06] bg-white">
        <Search className="size-5 text-muted-foreground" />
      </div>
      <h3 className="mt-5 text-base font-semibold tracking-[-0.01em] text-foreground">
        No businesses yet
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Be the first to go live on ServiceFlow.
      </p>
      <Link
        href="/apply"
        className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-all hover:bg-foreground/90 active:scale-[0.98]"
      >
        Apply now
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function BusinessListSkeleton() {
  return (
    <>
      <div className="mb-6 h-5 w-32 rounded-full bg-zinc-100" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="flex h-[180px] flex-col gap-3 rounded-2xl border border-black/[0.06] bg-white p-5 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-zinc-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/4 rounded-full bg-zinc-100" />
                <div className="h-2.5 w-1/2 rounded-full bg-zinc-100" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-2.5 w-full rounded-full bg-zinc-100" />
              <div className="h-2.5 w-5/6 rounded-full bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
