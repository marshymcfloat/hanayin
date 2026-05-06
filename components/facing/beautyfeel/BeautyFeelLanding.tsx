import Image from "next/image";
import Link from "next/link";
import {
  BusinessHours,
  SaleEvent,
  Service,
} from "@/prisma/generated/prisma/client";
import { beautyFeelContent, beautyFeelImages } from "./content";
import BeautyFeelShell from "./BeautyFeelShell";
import BeautyFeelMap from "./BeautyFeelMapWrapper";
import { ArrowRight, ArrowUpRight, Clock, MapPin } from "lucide-react";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const formatCurrency = (value: number) => currencyFormatter.format(value);

const formatDuration = (minutes?: number | null) => {
  if (!minutes) return "Flexible timing";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} hr ${remaining} min` : `${hours} hr`;
};

const formatTime = (value?: string | null) => {
  if (!value) return "By appointment";
  const [rawHours, rawMinutes] = value.split(":").map(Number);
  const hours = rawHours % 12 || 12;
  const minutes = rawMinutes.toString().padStart(2, "0");
  const period = rawHours >= 12 ? "PM" : "AM";
  return `${hours}:${minutes} ${period}`;
};

const dayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface BeautyFeelLandingProps {
  business: {
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  services: Service[];
  businessHours: BusinessHours[];
  saleEvents: SaleEvent[];
}

export default function BeautyFeelLanding({
  business,
  services,
  businessHours,
  saleEvents,
}: BeautyFeelLandingProps) {
  const navItems = [
    { label: "Signature", href: `/${business.slug}#signature` },
    { label: "Services", href: `/${business.slug}/services` },
    { label: "Visit", href: `/${business.slug}#visit` },
  ];

  const previewServices = services.slice(0, 6);

  const heroImage = business.imageUrl || beautyFeelImages.hero;

  const primaryHours = businessHours.filter(
    (hour) => hour.category === "GENERAL",
  );
  const hoursSource = primaryHours.length ? primaryHours : businessHours;
  const hoursByDay = dayLabels.map((label, index) => {
    const entry = hoursSource.find((hour) => hour.day_of_week === index);
    return {
      label,
      isClosed: entry?.is_closed ?? false,
      open: entry?.open_time,
      close: entry?.close_time,
    };
  });

  const todayIndex = new Date().getDay();
  const todayHours = hoursByDay[todayIndex];
  const hasLocation = business.latitude !== null && business.longitude !== null;

  return (
    <BeautyFeelShell
      businessName={business.name}
      businessSlug={business.slug}
      navItems={navItems}
    >
      {/* ──────────────────────────── HERO ─────────────────────────── */}
      {/* Full-bleed atmospheric image with editorial text overlay at the
          bottom. Negative top margin pulls the section up under the
          sticky header so the image extends edge-to-edge from the top of
          the viewport. The translucent cream header sits on top as a
          frosted "masthead" band. */}
      <section className="relative isolate -mt-16 min-h-[100svh] overflow-hidden sm:-mt-20">
        {/* Background image — fills the entire section */}
        <div className="absolute inset-0 -z-20">
          <Image
            src={heroImage}
            alt={`${business.name} studio`}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>

        {/* Full-image wash — tones down any bright spots in the photo
            (e.g. backlit blinds, sunlight) so overlay text reads
            consistently regardless of the image content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[color:var(--bf-ink)]/25"
        />
        {/* Bottom-up strong dark gradient — anchors the editorial text
            block in the lower half of the hero with enough opacity at the
            base for clean serif legibility. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[85%] bg-gradient-to-t from-[color:var(--bf-ink)]/95 via-[color:var(--bf-ink)]/65 to-transparent"
        />
        {/* Top vignette so the morphing header reads cleanly when
            transparent over the image. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-[color:var(--bf-ink)]/40 to-transparent"
        />

        {/* Content — anchored to the bottom of the hero. */}
        <div className="relative flex min-h-[100svh] flex-col">
          <div className="mt-auto px-6 pb-12 pt-32 sm:px-10 sm:pb-16 lg:pb-20 lg:pt-40">
            <div className="mx-auto max-w-7xl">
              <div className="max-w-3xl">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--bf-cream)]/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
                  {beautyFeelContent.hero.eyebrow}
                </p>
                <h1 className="mt-5 whitespace-pre-line text-balance font-[var(--font-serif)] text-[2.5rem] font-normal leading-[1.02] tracking-[-0.01em] text-[color:var(--bf-cream)] [text-shadow:0_2px_8px_rgba(0,0,0,0.35)] sm:text-6xl lg:text-[5rem] xl:text-[6rem]">
                  {beautyFeelContent.hero.title}
                </h1>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-[color:var(--bf-cream)]/95 [text-shadow:0_1px_4px_rgba(0,0,0,0.35)] sm:text-lg">
                  {beautyFeelContent.hero.description}
                </p>
                <div className="mt-8 flex flex-col items-stretch gap-3 sm:mt-10 sm:flex-row sm:items-center">
                  <Link
                    href={`/${business.slug}/booking`} scroll={false}
                    className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--bf-cream)] px-7 text-sm font-medium tracking-wide text-[color:var(--bf-ink)] transition-all hover:bg-[color:var(--bf-cream)]/90 active:scale-[0.98]"
                  >
                    {beautyFeelContent.hero.primaryCta}
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href={`/${business.slug}/services`}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[color:var(--bf-cream)]/30 bg-transparent px-7 text-sm font-medium tracking-wide text-[color:var(--bf-cream)] backdrop-blur-sm transition-colors hover:bg-[color:var(--bf-cream)]/10"
                  >
                    {beautyFeelContent.hero.secondaryCta}
                  </Link>
                </div>
              </div>

              {/* Quick facts bar — runs along the bottom of the hero,
                  hairline above for editorial separation */}
              <dl className="mt-12 grid grid-cols-2 gap-x-4 gap-y-6 border-t border-[color:var(--bf-cream)]/30 pt-6 sm:mt-16 sm:grid-cols-4 sm:gap-x-8">
                {beautyFeelContent.quickFacts.map((fact) => (
                  <div key={fact.label}>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--bf-cream)]/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
                      {fact.label}
                    </dt>
                    <dd className="mt-2 text-sm font-medium tracking-[-0.005em] text-[color:var(--bf-cream)] [text-shadow:0_1px_3px_rgba(0,0,0,0.4)] sm:text-base">
                      {fact.value}
                    </dd>
                  </div>
                ))}
                {/* Today's hours as the 4th cell */}
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--bf-cream)]/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
                    Today
                  </dt>
                  <dd className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium tracking-[-0.005em] text-[color:var(--bf-cream)] [text-shadow:0_1px_3px_rgba(0,0,0,0.4)] sm:text-base">
                    <span className="size-1.5 rounded-full bg-[color:var(--bf-sage)]" />
                    {todayHours?.isClosed
                      ? "Closed"
                      : `${formatTime(todayHours?.open)}–${formatTime(todayHours?.close)}`}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── ATMOSPHERIC STRIP ─────────────────── */}
      <section className="border-y border-black/[0.06] bg-[color:var(--bf-blush)]/25">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-[color:var(--bf-muted)] sm:gap-x-10">
          <span>By appointment</span>
          <span aria-hidden className="text-[color:var(--bf-muted)]/40">
            ·
          </span>
          <span>Puerto Princesa · Palawan</span>
          <span aria-hidden className="text-[color:var(--bf-muted)]/40">
            ·
          </span>
          <span>Walk-ins welcome (limited)</span>
        </div>
      </section>

      {/* ──────────────────── SIGNATURE THREE ──────────────────── */}
      <section
        id="signature"
        className="scroll-mt-24 sm:scroll-mt-28"
      >
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28 lg:py-32">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--bf-muted)]">
              {beautyFeelContent.signature.eyebrow}
            </p>
            <h2 className="mt-4 font-[var(--font-serif)] text-3xl font-normal leading-[1.1] tracking-[-0.01em] text-[color:var(--bf-ink)] sm:text-5xl">
              What we do, and how we do it.
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:mt-14 sm:grid-cols-3 sm:gap-7">
            {beautyFeelContent.signature.items.map((item, idx) => {
              const img = beautyFeelImages[item.image as keyof typeof beautyFeelImages];
              return (
                <article
                  key={item.title}
                  className={
                    "group flex flex-col" +
                    // Slight visual variation: middle card sits lower on
                    // desktop for a subtle editorial offset.
                    (idx === 1 ? " sm:mt-10" : "")
                  }
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-black/[0.06] bg-[color:var(--bf-blush)]/30">
                    <Image
                      src={img}
                      alt={item.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="mt-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--bf-muted)]">
                      {item.category}
                    </p>
                    <h3 className="mt-2 font-[var(--font-serif)] text-2xl font-normal tracking-[-0.005em] text-[color:var(--bf-ink)]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[color:var(--bf-muted)]">
                      {item.description}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ──────────────── STUDIO PRINCIPLES ──────────────── */}
      <section className="border-y border-black/[0.06] bg-[color:var(--bf-cream)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 sm:py-28 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:py-32">
          {/* Left: still-life image */}
          <div className="relative">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-black/[0.06] bg-[color:var(--bf-blush)]/40 sm:aspect-[3/4] lg:sticky lg:top-28">
              <Image
                src={beautyFeelImages.stillLife}
                alt="Studio still life"
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
            </div>
          </div>
          {/* Right: principles */}
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--bf-muted)]">
              Three things we won&apos;t compromise on
            </p>
            <h2 className="mt-4 font-[var(--font-serif)] text-3xl font-normal leading-[1.1] tracking-[-0.01em] text-[color:var(--bf-ink)] sm:text-5xl">
              The studio&apos;s standing rules.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[color:var(--bf-muted)]">
              Boutique service shouldn&apos;t feel improvised. These are the
              decisions we made before the doors opened, and we don&apos;t
              revisit them.
            </p>
            <ol className="mt-10 space-y-9">
              {beautyFeelContent.principles.map((p) => (
                <li key={p.number} className="flex gap-5 sm:gap-7">
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--bf-accent)] sm:pt-1.5">
                    {p.number}
                  </span>
                  <div className="flex-1 border-t border-black/[0.08] pt-4">
                    <h3 className="font-[var(--font-serif)] text-xl font-normal leading-tight tracking-[-0.005em] text-[color:var(--bf-ink)] sm:text-2xl">
                      {p.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[color:var(--bf-muted)] sm:text-base">
                      {p.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ──────────────────── SERVICES PREVIEW ──────────────────── */}
      <section
        id="services"
        className="scroll-mt-24 sm:scroll-mt-28"
      >
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28 lg:py-32">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--bf-muted)]">
                The menu
              </p>
              <h2 className="mt-4 font-[var(--font-serif)] text-3xl font-normal leading-[1.1] tracking-[-0.01em] text-[color:var(--bf-ink)] sm:text-5xl">
                A short list, done well.
              </h2>
            </div>
            <Link
              href={`/${business.slug}/services`}
              className="group inline-flex items-center gap-1.5 self-start text-sm font-medium tracking-tight text-[color:var(--bf-ink)] underline-offset-4 hover:underline sm:self-end"
            >
              See full menu
              <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {previewServices.length > 0 ? (
            <ul className="mt-10 divide-y divide-black/[0.08] border-y border-black/[0.08] sm:mt-14">
              {previewServices.map((service) => (
                <li key={service.id} className="group">
                  <Link
                    href={`/${business.slug}/booking`} scroll={false}
                    className="flex items-baseline gap-4 py-5 transition-colors hover:bg-black/[0.015] sm:gap-6 sm:py-7"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3 sm:gap-5">
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--bf-muted)] hidden sm:block sm:w-20 shrink-0">
                          {service.category}
                        </p>
                        <h3 className="font-[var(--font-serif)] text-lg font-normal leading-tight tracking-[-0.005em] text-[color:var(--bf-ink)] sm:text-2xl">
                          {service.name}
                        </h3>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[color:var(--bf-muted)] sm:ml-[6.25rem] sm:text-sm">
                        {service.description ||
                          "Tailored care with a gentle, restorative finish."}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-[var(--font-serif)] text-lg font-normal tabular-nums text-[color:var(--bf-ink)] sm:text-2xl">
                        {formatCurrency(service.price)}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--bf-muted)]">
                        <Clock className="size-2.5" />
                        {formatDuration(service.duration)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-10 rounded-2xl border border-dashed border-black/[0.15] bg-[color:var(--bf-cream)] px-6 py-12 text-center text-sm text-[color:var(--bf-muted)]">
              No services listed yet.
            </div>
          )}
        </div>
      </section>

      {/* ───────────────────── ACTIVE EVENTS ───────────────────── */}
      {saleEvents.length > 0 && (
        <section className="border-y border-black/[0.06] bg-[color:var(--bf-blush)]/30">
          <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--bf-muted)]">
              On the menu now
            </p>
            <h2 className="mt-4 font-[var(--font-serif)] text-2xl font-normal leading-tight tracking-[-0.01em] text-[color:var(--bf-ink)] sm:text-3xl">
              Seasonal & limited
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
              {saleEvents.map((event) => (
                <article
                  key={event.id}
                  className="rounded-2xl border border-black/[0.08] bg-[color:var(--bf-cream)] p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-[var(--font-serif)] text-xl font-normal tracking-[-0.005em] text-[color:var(--bf-ink)]">
                      {event.title}
                    </h3>
                    <span className="inline-flex items-center rounded-full bg-[color:var(--bf-accent)]/30 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--bf-ink)]">
                      {event.discount_type === "PERCENTAGE"
                        ? `${event.discount_value}% off`
                        : `${formatCurrency(event.discount_value)} off`}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[color:var(--bf-muted)]">
                    {event.description ||
                      "Enjoy limited-time pricing across select services."}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ──────────────────────── VISIT US ──────────────────────── */}
      <section
        id="visit"
        className="scroll-mt-24 sm:scroll-mt-28"
      >
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28 lg:py-32">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--bf-muted)]">
              Visit
            </p>
            <h2 className="mt-4 font-[var(--font-serif)] text-3xl font-normal leading-[1.1] tracking-[-0.01em] text-[color:var(--bf-ink)] sm:text-5xl">
              Find your calm in person.
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:mt-14 lg:grid-cols-[1.2fr_1fr] lg:gap-10">
            {/* `lg:self-start` keeps the map from stretching to match the
                hours/note column's height — the bordered outline now
                hugs the iframe instead of trapping empty space below. */}
            <div className="overflow-hidden rounded-2xl border border-black/[0.08] lg:self-start">
              {hasLocation ? (
                <BeautyFeelMap
                  latitude={business.latitude as number}
                  longitude={business.longitude as number}
                  label={business.name}
                />
              ) : (
                <div className="flex h-72 items-center justify-center bg-[color:var(--bf-blush)]/30 px-6 py-12 text-center text-sm text-[color:var(--bf-muted)]">
                  Map coming soon.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-5 sm:gap-6">
              {/* Hours */}
              <div className="rounded-2xl border border-black/[0.08] bg-[color:var(--bf-cream)] p-6 sm:p-7">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--bf-muted)]">
                  <Clock className="size-3" />
                  Studio hours
                </div>
                <ul className="mt-5 space-y-2 text-sm">
                  {hoursByDay.map((day, i) => (
                    <li
                      key={day.label}
                      className={
                        "flex items-baseline justify-between border-b border-black/[0.05] pb-2 last:border-0 last:pb-0 " +
                        (i === todayIndex
                          ? "text-[color:var(--bf-ink)] font-medium"
                          : "text-[color:var(--bf-muted)]")
                      }
                    >
                      <span>
                        {i === todayIndex ? `${day.label} · today` : day.label}
                      </span>
                      <span className="tabular-nums">
                        {day.isClosed
                          ? "Closed"
                          : `${formatTime(day.open)}–${formatTime(day.close)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Studio note */}
              <div className="rounded-2xl border border-black/[0.08] bg-[color:var(--bf-cream)] p-6 sm:p-7">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--bf-muted)]">
                  <MapPin className="size-3" />
                  Note
                </div>
                <p className="mt-5 text-sm leading-relaxed text-[color:var(--bf-ink)]">
                  {business.description ||
                    "Appointments are tailored to your needs. Arrive 10 minutes early to settle in."}
                </p>
                {hasLocation && (
                  <a
                    href={`https://www.google.com/maps?q=${business.latitude},${business.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--bf-ink)] underline-offset-4 hover:underline"
                  >
                    Get directions
                    <ArrowUpRight className="size-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────── FINAL CTA ───────────────── */}
      {/* Atmospheric Pexels image as bg, dark wash + bottom-up gradient
          for text contrast. Leaner padding than before so the section
          reads as a closing accent rather than a second hero. */}
      <section className="relative isolate overflow-hidden text-[color:var(--bf-cream)]">
        {/* Background image */}
        <div className="absolute inset-0 -z-20">
          <Image
            src={beautyFeelImages.cta}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>
        {/* Overall dark wash + radial accent + edge vignette */}
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
            A quiet hour, set aside for you.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-[color:var(--bf-cream)]/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.4)] sm:text-base">
            Book in under a minute. We&apos;ll confirm by message and have
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
