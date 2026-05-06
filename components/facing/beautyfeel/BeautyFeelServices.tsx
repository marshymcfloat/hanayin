import Image from "next/image";
import Link from "next/link";
import { Service } from "@/prisma/generated/prisma/client";
import BeautyFeelShell from "./BeautyFeelShell";
import { beautyFeelImages } from "./content";
import { ArrowRight, ArrowUpRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const formatCurrency = (value: number) => currencyFormatter.format(value);

const formatDuration = (minutes?: number | null) => {
  if (!minutes) return "Flexible";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} hr ${remaining} min` : `${hours} hr`;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Convert a 1-based index to a Roman numeral. */
function toRoman(num: number): string {
  if (num <= 0) return String(num);
  const map: ReadonlyArray<readonly [number, string]> = [
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let result = "";
  let n = num;
  for (const [value, numeral] of map) {
    while (n >= value) {
      result += numeral;
      n -= value;
    }
  }
  return result;
}

/** Map a category label to a relevant Pexels image. Falls back to the
 *  still-life when no keyword matches. */
function getCategoryImage(category: string): string {
  const lower = category.toLowerCase();
  if (
    lower.includes("skin") ||
    lower.includes("facial") ||
    lower.includes("face") ||
    lower.includes("derma")
  ) {
    return beautyFeelImages.skin;
  }
  if (
    lower.includes("nail") ||
    lower.includes("mani") ||
    lower.includes("pedi")
  ) {
    return beautyFeelImages.nails;
  }
  if (
    lower.includes("lash") ||
    lower.includes("eye") ||
    lower.includes("brow")
  ) {
    return beautyFeelImages.lashes;
  }
  return beautyFeelImages.stillLife;
}

export interface BeautyFeelServicesProps {
  business: {
    name: string;
    slug: string;
  };
  services: Service[];
}

export default function BeautyFeelServices({
  business,
  services,
}: BeautyFeelServicesProps) {
  const grouped = services.reduce<Record<string, Service[]>>((acc, service) => {
    acc[service.category] = acc[service.category] || [];
    acc[service.category].push(service);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  // Same nav as home for consistency. "Visit" is a cross-page anchor
  // — the browser navigates to /[slug]#visit and lands at the section.
  const navItems = [
    { label: "Home", href: `/${business.slug}` },
    { label: "Services", href: `/${business.slug}/services` },
    { label: "Visit", href: `/${business.slug}#visit` },
  ];

  return (
    <BeautyFeelShell
      businessName={business.name}
      businessSlug={business.slug}
      navItems={navItems}
    >
      {/* ──────────────────────── HERO ──────────────────────── */}
      {/* Shorter than the home hero — this is a sub-page, not the
          headlining event. Still full-bleed image with editorial
          overlay so it shares the language. */}
      <section className="relative isolate -mt-16 min-h-[70svh] overflow-hidden sm:-mt-20 sm:min-h-[60svh] lg:min-h-[65svh]">
        <div className="absolute inset-0 -z-20">
          <Image
            src={beautyFeelImages.services}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>

        {/* Layered overlays — same legibility stack as the home hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[color:var(--bf-ink)]/30"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[80%] bg-gradient-to-t from-[color:var(--bf-ink)]/95 via-[color:var(--bf-ink)]/55 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-[color:var(--bf-ink)]/40 to-transparent"
        />

        <div className="relative flex min-h-[70svh] flex-col sm:min-h-[60svh] lg:min-h-[65svh]">
          <div className="mt-auto px-6 pb-12 pt-32 sm:px-10 sm:pb-14 lg:pb-16 lg:pt-40">
            <div className="mx-auto max-w-7xl">
              <div className="max-w-3xl">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--bf-cream)]/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
                  The menu
                </p>
                <h1 className="mt-5 text-balance font-[var(--font-serif)] text-[2.5rem] font-normal leading-[1.02] tracking-[-0.01em] text-[color:var(--bf-cream)] [text-shadow:0_2px_8px_rgba(0,0,0,0.35)] sm:text-6xl lg:text-7xl xl:text-[5.5rem]">
                  A short list, <em className="not-italic font-[var(--font-serif)] italic">done well</em>.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-[color:var(--bf-cream)]/95 [text-shadow:0_1px_4px_rgba(0,0,0,0.35)] sm:text-lg">
                  Treatments grouped by room. Pick what suits the day —
                  we&apos;ll talk through any add-ons during the visit.
                </p>
                <div className="mt-8 flex flex-col items-stretch gap-3 sm:mt-10 sm:flex-row sm:items-center">
                  <Link
                    href={`/${business.slug}/booking`} scroll={false}
                    className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--bf-cream)] px-7 text-sm font-medium tracking-wide text-[color:var(--bf-ink)] transition-all hover:bg-[color:var(--bf-cream)]/90 active:scale-[0.98]"
                  >
                    Book an appointment
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href={`/${business.slug}`}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[color:var(--bf-cream)]/30 bg-transparent px-7 text-sm font-medium tracking-wide text-[color:var(--bf-cream)] backdrop-blur-sm transition-colors hover:bg-[color:var(--bf-cream)]/10"
                  >
                    Back to studio
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────── CATEGORY STRIP (mobile) ────────────────────── */}
      {/* Horizontally scrolling chip list on mobile — pure visual cue, also
          gives a fast jump nav. Hidden on lg where the sidebar takes over. */}
      <section className="border-y border-black/[0.06] bg-[color:var(--bf-blush)]/25 lg:hidden">
        <div className="mx-auto max-w-7xl">
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex gap-2 px-6 py-4 whitespace-nowrap">
              {categories.map((category) => (
                <li key={category}>
                  <a
                    href={`#${slugify(category)}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.08] bg-[color:var(--bf-cream)] px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--bf-ink)] transition-colors hover:bg-[color:var(--bf-blush)]/50"
                  >
                    {category}
                    <span className="text-[color:var(--bf-muted)]">
                      {grouped[category].length}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ────────────────────── MENU ────────────────────── */}
      {/* Layout — desktop: 200px sticky category rail + magazine spreads.
                   tablet/mobile: spreads stack with image as wide banner. */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:grid lg:grid-cols-[200px_1fr] lg:gap-16 lg:py-24">
        {/* Sticky jump rail (desktop only) */}
        <aside className="hidden lg:block">
          <div className="sticky top-32">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--bf-muted)]">
              The menu
            </p>
            <nav className="mt-5">
              <ul className="space-y-1">
                {categories.map((category, idx) => (
                  <li key={category}>
                    <a
                      href={`#${slugify(category)}`}
                      className="group flex items-baseline justify-between gap-3 border-l border-black/[0.08] py-1.5 pl-4 font-[var(--font-serif)] text-base leading-tight text-[color:var(--bf-muted)] transition-colors hover:border-[color:var(--bf-ink)] hover:text-[color:var(--bf-ink)]"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--bf-muted)]/60">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span>{category}</span>
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-[color:var(--bf-muted)]/60 group-hover:text-[color:var(--bf-muted)]">
                        {String(grouped[category].length).padStart(2, "0")}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-8 max-w-[14rem] text-xs italic leading-relaxed text-[color:var(--bf-muted)]">
                Tap any treatment to begin booking. We&apos;ll confirm by
                message before your visit.
              </p>
            </nav>
          </div>
        </aside>

        <div className="space-y-24 sm:space-y-28 lg:space-y-36">
          {categories.length === 0 && (
            <div className="rounded-2xl border border-dashed border-black/[0.15] bg-[color:var(--bf-cream)] px-6 py-16 text-center text-sm text-[color:var(--bf-muted)]">
              The menu is being prepared. Please check back soon.
            </div>
          )}

          {categories.map((category, idx) => {
            const image = getCategoryImage(category);
            const isReverse = idx % 2 === 1;
            const items = grouped[category];

            return (
              <article
                key={category}
                id={slugify(category)}
                className="scroll-mt-28 sm:scroll-mt-32"
              >
                <div
                  className={cn(
                    "grid grid-cols-1 gap-8 sm:gap-10 lg:grid-cols-[5fr_7fr] lg:gap-14",
                    // Alternate image position on lg only — keeps mobile
                    // stacking consistent (image on top → content below).
                    isReverse && "lg:[&>div:first-child]:order-2",
                  )}
                >
                  {/* ── Image side: portrait card with overlaid title ── */}
                  <div>
                    <div className="lg:sticky lg:top-32">
                      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-black/[0.08] bg-[color:var(--bf-blush)]/40 sm:aspect-[16/9] lg:aspect-[4/5]">
                        <Image
                          src={image}
                          alt={category}
                          fill
                          sizes="(max-width: 1024px) 100vw, 40vw"
                          className="object-cover"
                        />
                        {/* Gradient mask + overlay text */}
                        <div
                          aria-hidden
                          className="absolute inset-0 bg-gradient-to-t from-[color:var(--bf-ink)]/85 via-[color:var(--bf-ink)]/15 to-transparent"
                        />
                        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
                          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[color:var(--bf-cream)]/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
                            Ritual {String(idx + 1).padStart(2, "0")}
                          </p>
                          <h2 className="mt-2 font-[var(--font-serif)] text-3xl font-normal leading-[1.05] tracking-[-0.01em] text-[color:var(--bf-cream)] [text-shadow:0_2px_8px_rgba(0,0,0,0.4)] sm:text-4xl lg:text-5xl">
                            {category}
                          </h2>
                          <p className="mt-2 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--bf-cream)]/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
                            <span className="size-1 rounded-full bg-[color:var(--bf-accent)]" />
                            {items.length}{" "}
                            {items.length === 1 ? "treatment" : "treatments"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Services side: stanza-style entries ── */}
                  <div>
                    <ol className="space-y-12 sm:space-y-14">
                      {items.map((service, i) => (
                        <li key={service.id}>
                          <article className="group relative">
                            {/* Roman numeral — large in margin on lg, inline
                                on smaller screens */}
                            <header className="flex items-baseline gap-4 sm:gap-6">
                              <span
                                aria-hidden
                                className="font-[var(--font-serif)] text-2xl font-normal italic leading-none text-[color:var(--bf-accent)] sm:text-3xl"
                              >
                                {toRoman(i + 1)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <h3 className="font-[var(--font-serif)] text-2xl font-normal leading-tight tracking-[-0.005em] text-[color:var(--bf-ink)] transition-colors group-hover:text-[color:var(--bf-ink)] sm:text-[1.75rem] lg:text-3xl">
                                  {service.name}
                                </h3>
                                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--bf-muted)]">
                                  <Clock className="mr-1 inline size-2.5" />
                                  {formatDuration(service.duration)}
                                </p>
                              </div>
                            </header>

                            {/* Description, indented to align with the
                                service name (under the numeral on lg) */}
                            <p className="mt-4 max-w-xl pl-9 text-sm leading-relaxed text-[color:var(--bf-muted)] sm:pl-12 sm:text-base">
                              {service.description ||
                                "A tailored session with thoughtful details."}
                            </p>

                            {/* Footer row — hairline + price + reserve */}
                            <div className="mt-5 ml-9 flex items-baseline justify-between gap-4 border-t border-black/[0.08] pt-4 sm:ml-12 sm:mt-6">
                              <span className="font-[var(--font-serif)] text-2xl font-normal tabular-nums text-[color:var(--bf-ink)] sm:text-3xl">
                                {formatCurrency(service.price)}
                              </span>
                              <Link
                                href={`/${business.slug}/booking`} scroll={false}
                                className="group/cta inline-flex h-9 items-center gap-1.5 px-1 text-sm font-medium text-[color:var(--bf-ink)] underline-offset-4 transition-colors hover:underline"
                              >
                                Reserve
                                <ArrowUpRight className="size-3.5 transition-transform duration-200 group-hover/cta:-translate-y-0.5 group-hover/cta:translate-x-0.5" />
                              </Link>
                            </div>
                          </article>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ───────────────── FINAL CTA ───────────────── */}
      <section className="relative isolate overflow-hidden text-[color:var(--bf-cream)]">
        <div className="absolute inset-0 -z-20">
          <Image
            src={beautyFeelImages.cta}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[color:var(--bf-ink)]/70"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[color:var(--bf-ink)]/40 via-transparent to-[color:var(--bf-ink)]/40"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 size-[500px] -translate-x-1/2 rounded-full bg-[color:var(--bf-accent)]/15 blur-[140px]"
        />

        <div className="relative mx-auto max-w-3xl px-6 py-16 text-center sm:py-20 lg:py-24">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--bf-cream)]/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
            Reserve
          </p>
          <h2 className="mt-4 text-balance font-[var(--font-serif)] text-3xl font-normal italic leading-[1.05] tracking-[-0.01em] text-[color:var(--bf-cream)] [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-5xl lg:text-6xl">
            Pick a treatment. We&apos;ll do the rest.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-[color:var(--bf-cream)]/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.4)] sm:text-base">
            Booking takes under a minute. We confirm by message and have
            everything ready when you arrive.
          </p>
          <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:mt-9 sm:flex-row sm:items-center">
            <Link
              href={`/${business.slug}/booking`} scroll={false}
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[color:var(--bf-cream)] px-6 text-sm font-medium tracking-wide text-[color:var(--bf-ink)] transition-all hover:bg-[color:var(--bf-cream)]/90 active:scale-[0.98]"
            >
              Book an appointment
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link
              href={`/${business.slug}/claim-gift-card`} scroll={false}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/5 px-6 text-sm font-medium tracking-wide text-[color:var(--bf-cream)] backdrop-blur-sm transition-colors hover:bg-white/10"
            >
              Claim a gift card
            </Link>
          </div>
        </div>
      </section>
    </BeautyFeelShell>
  );
}
