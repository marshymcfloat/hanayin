"use client";

import { motion } from "motion/react";

export default function SolutionSection() {
  return (
    <section
      id="features"
      className="relative py-20 sm:py-28 lg:py-32 scroll-mt-24 sm:scroll-mt-28 bg-zinc-50/50"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Everything in one place
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-4xl lg:text-5xl">
            Six tools, replaced by one.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            Built for salons, spas, and barbershops — not generic SMBs.
            Every feature is tuned for how appointment-based businesses
            actually run.
          </p>
        </motion.div>

        {/* Bento grid — keeps its character at every breakpoint via 2-col
            mobile layout with mixed col-spans, then expands to 3-col
            at lg. Layout:
              Mobile/Tablet (2-col):                 Desktop (3-col):
              Row 1: Booking [2] + Reminders [1]?    Row 1: Booking [2] + Reminders [1]
                     (Reminders rolls to row 2)       Row 2: Reports [3, full-width]
              Row 2: Reminders [1] + CRM [1]          Row 3: CRM [1] + Promo [1] + Payroll [1]
              Row 3: Reports [2, full-width]          Row 4: Public site [3, full-width]
              Row 4: Promo [1] + Payroll [1]
              Row 5: Public site [2, full-width]
                                                                                  */}
        <div className="mt-14 grid grid-cols-2 gap-3 sm:mt-16 sm:gap-4 lg:grid-cols-3 lg:gap-4">
          {/* Booking — wide tile, brand-green primary tint (key feature) */}
          <BentoTile className="col-span-2 lg:order-1 lg:col-span-2">
            <BentoVisual className="bg-gradient-to-br from-primary/[0.12] via-primary/[0.04] to-transparent">
              <BookingPreview />
            </BentoVisual>
            <BentoMeta
              title="Online booking, 24/7"
              description="A booking flow customers complete in under 30 seconds."
            />
          </BentoTile>

          {/* Reminders — indigo tint for "messaging/communication" */}
          <BentoTile className="col-span-1 lg:order-2">
            <BentoVisual className="bg-gradient-to-br from-indigo-50 via-indigo-50/30 to-transparent">
              <RemindersPreview />
            </BentoVisual>
            <BentoMeta
              title="Auto reminders"
              description="SMS + email, sent on time. Cuts no-shows in half."
            />
          </BentoTile>

          {/* CRM — rose tint for "warm customer relationship".
              Paired with Reminders on mobile/tablet, slots into the
              CRM/Promo/Payroll trio on desktop. */}
          <BentoTile className="col-span-1 lg:order-4">
            <BentoVisual className="bg-gradient-to-br from-rose-50 via-rose-50/30 to-transparent">
              <CRMPreview />
            </BentoVisual>
            <BentoMeta
              title="Customer history"
              description="Pulled up by phone. Visits, prefs, notes."
            />
          </BentoTile>

          {/* Reports — brand-green primary tint (key analytics feature).
              Full-width tile. Reorders to Row 2 on desktop so the 3-col
              layout has no holes. */}
          <BentoTile className="col-span-2 lg:order-3 lg:col-span-3">
            <BentoVisual
              className="bg-gradient-to-br from-primary/[0.12] via-primary/[0.04] to-transparent"
              wide
            >
              <ReportsPreview />
            </BentoVisual>
            <BentoMeta
              title="Reports that decide for you"
              description="Slow days, top services, staff performance — at a glance."
            />
          </BentoTile>

          {/* Promo Engine — amber tint, hints "sales / deals" */}
          <BentoTile className="col-span-1 lg:order-5">
            <BentoVisual className="bg-gradient-to-br from-amber-50 via-amber-50/40 to-transparent">
              <PromoPreview />
            </BentoVisual>
            <BentoMeta
              title="Promo engine"
              description="Birthdays + flash sales, automated."
            />
          </BentoTile>

          {/* Payroll — sky-blue tint, hints "finance / numbers".
              Paired with Promo on mobile/tablet. */}
          <BentoTile className="col-span-1 lg:order-6">
            <BentoVisual className="bg-gradient-to-br from-sky-50 via-sky-50/30 to-transparent">
              <PayrollPreview />
            </BentoVisual>
            <BentoMeta
              title="Payroll, sorted"
              description="Hours + commissions, calculated for you."
            />
          </BentoTile>

          {/* Public site — full-width tile with brand-green wash */}
          <BentoTile className="col-span-2 lg:order-7 lg:col-span-3">
            <div className="relative grid grid-cols-1 gap-5 p-5 sm:gap-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
              {/* Subtle primary-tinted spotlight behind content */}
              <div
                aria-hidden
                className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-primary/[0.08] blur-3xl"
              />
              <div>
                <h3 className="text-balance text-lg font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">
                  Your own booking website, in minutes.
                </h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:mt-3 sm:text-base">
                  Every business gets a customer-facing page —
                  serviceflow.ph/your-name — wired to your live availability.
                </p>
              </div>
              <SitePreview />
            </div>
          </BentoTile>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Bento primitives                                                            */
/* -------------------------------------------------------------------------- */

function BentoTile({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={
        // Stronger shadow + slightly darker border so the white tile pops
        // against the off-white section background.
        "relative flex flex-col overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.06)] " +
        className
      }
    >
      {children}
    </motion.div>
  );
}

function BentoVisual({
  children,
  className = "",
  wide = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** When true, uses a wider/shorter aspect ratio suitable for full-width
      tiles like Reports — keeps the visual area proportional. */
  wide?: boolean;
}) {
  return (
    <div
      className={
        "relative w-full overflow-hidden border-b border-black/[0.05] " +
        (wide
          ? "aspect-[16/6] sm:aspect-[16/4] "
          : // Mobile: shorter visual (3:2) so the overall tile reads
            // closer to square at the 2-col width.
            // Tablet: cinematic 16:10 once tiles get wider.
            // Desktop: drop the aspect ratio entirely and let the visual
            // flex-grow to fill the tile. When tiles are forced tall by
            // a sibling in the same row (e.g. Booking's calendar), this
            // absorbs the extra height into the preview rather than
            // leaving empty space below the meta text.
            // The min-height (300px) is tuned to fit the tallest preview
            // content (Booking's calendar, Reminders' chat) so nothing
            // gets clipped at the visual's overflow-hidden edge. Smaller
            // previews (CRM, Promo, Payroll) center within the extra
            // space, reading as intentional breathing room.
            "aspect-[3/2] sm:aspect-[16/10] lg:aspect-auto lg:flex-1 lg:min-h-[300px] ") +
        className
      }
    >
      {children}
    </div>
  );
}

function BentoMeta({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-3.5 sm:p-6">
      <h3 className="line-clamp-1 text-[13px] font-semibold tracking-[-0.01em] text-foreground sm:line-clamp-none sm:text-lg">
        {title}
      </h3>
      <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-muted-foreground sm:mt-1.5 sm:line-clamp-none sm:text-sm sm:leading-relaxed">
        {description}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tile previews — pure SVG/CSS, no real screenshots                           */
/* -------------------------------------------------------------------------- */

function BookingPreview() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-sm rounded-xl border border-black/[0.06] bg-white p-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] sm:p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">May 2026</span>
          <div className="flex gap-1">
            <span className="size-1.5 rounded-full bg-zinc-300" />
            <span className="size-1.5 rounded-full bg-zinc-300" />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-[10px]">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span
              key={i}
              className="text-center font-medium text-muted-foreground/70"
            >
              {d}
            </span>
          ))}
          {Array.from({ length: 21 }).map((_, i) => {
            const day = i + 1;
            const isPicked = day === 12;
            const hasDot = [3, 7, 14, 18].includes(day);
            return (
              <span
                key={day}
                className={
                  "relative aspect-square rounded-md text-center leading-[1.6rem] " +
                  (isPicked
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "text-foreground hover:bg-zinc-50")
                }
              >
                {day}
                {hasDot && !isPicked && (
                  <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary/60" />
                )}
              </span>
            );
          })}
        </div>
        <div className="mt-3 flex gap-1.5">
          {["10:00", "11:30", "2:00"].map((t, i) => (
            <span
              key={t}
              className={
                "rounded-md border px-2 py-1 text-[10px] font-medium " +
                (i === 1
                  ? "border-primary/30 bg-primary/[0.08] text-primary"
                  : "border-black/[0.06] bg-white text-foreground")
              }
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RemindersPreview() {
  return (
    <div className="absolute inset-0 flex flex-col gap-1.5 p-4 sm:p-5">
      {/* Channel header — gives the panel structure */}
      <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.1em] text-muted-foreground/70">
        <span>SMS · +63 917 ••• 4421</span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-primary" />
          Live
        </span>
      </div>

      {/* Conversation pinned to the bottom. Three messages — sized to fit
          comfortably even in the tallest tile alongside Booking's
          calendar without overflowing or clipping. */}
      <div className="flex flex-1 flex-col justify-end gap-1.5">
        <div className="ml-auto flex flex-col items-end gap-0.5">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-[11px] font-medium leading-snug text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            Hi Maria! Your appointment is tomorrow at 10:00 AM
          </div>
          <span className="pr-1 text-[8px] font-medium text-muted-foreground/60">
            6:00 PM
          </span>
        </div>

        <div className="ml-auto flex flex-col items-end gap-0.5">
          <div className="max-w-[60%] rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-[11px] font-medium leading-snug text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            Reply Y to confirm
          </div>
        </div>

        <div className="mr-auto flex flex-col items-start gap-0.5">
          <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-zinc-100 px-3 py-1.5 text-[11px] font-semibold text-foreground">
            <span>Y</span>
            <svg
              viewBox="0 0 12 12"
              className="size-2.5 text-primary"
              fill="none"
              aria-hidden
            >
              <path
                d="M2 6.5L4.5 9L10 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="pl-1 text-[8px] font-medium text-muted-foreground/60">
            6:02 PM · Confirmed
          </span>
        </div>
      </div>
    </div>
  );
}

function CRMPreview() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-[18rem] rounded-xl border border-black/[0.06] bg-white p-2.5 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.08)] sm:p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            M
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-foreground">
              Maria Santos
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              +63 917 ••• 4421 · 12 visits
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {[
            "Manicure gel · ₱280",
            "Pedicure · ₱350",
            "Hair color · ₱1,200",
          ].map((line, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md bg-zinc-50 px-2 py-1.5 text-[10px] text-foreground"
            >
              <span className="truncate">{line}</span>
              <span className="text-muted-foreground">
                {["3d", "1w", "2w"][i]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportsPreview() {
  // Static, deterministic bars — no fabricated numbers. Heights resolve
  // against the visual container (which has a fixed aspect ratio), so
  // percentages compute correctly. Faux x-axis labels along the bottom.
  const bars = [38, 52, 44, 70, 58, 81, 66, 74, 60, 88, 72, 79];
  const labels = ["M", "T", "W", "T", "F", "S", "S", "M", "T", "W", "T", "F"];
  return (
    <div className="absolute inset-0 flex flex-col gap-2 p-5 sm:p-7">
      {/* Bars */}
      <div className="flex flex-1 items-end gap-1.5 sm:gap-2">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-md bg-gradient-to-t from-primary/40 to-primary/85 transition-all"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      {/* Faux baseline + labels */}
      <div className="flex items-center gap-1.5 border-t border-black/[0.06] pt-2 sm:gap-2">
        {labels.map((l, i) => (
          <span
            key={i}
            className="flex-1 text-center font-mono text-[9px] text-muted-foreground/60"
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function PromoPreview() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-5">
      <div className="-rotate-3 rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-1 text-[11px] font-semibold text-primary">
        Birthday · −20%
      </div>
      <div className="rotate-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
        Flash sale · 2 hrs
      </div>
      <div className="-rotate-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-foreground">
        Rebook in 30d · −10%
      </div>
    </div>
  );
}

function PayrollPreview() {
  const rows = [
    ["Hours", "168"],
    ["Commission", "₱8,400"],
    ["Tips", "₱2,140"],
    ["Total", "₱24,540"],
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-[16rem] rounded-xl border border-black/[0.06] bg-white p-2.5 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.08)] sm:p-3.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          May Cycle
        </div>
        <div className="mt-2 divide-y divide-black/[0.04]">
          {rows.map(([label, value], i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 text-xs"
            >
              <span className="text-muted-foreground">{label}</span>
              <span
                className={
                  "tabular-nums " +
                  (i === rows.length - 1
                    ? "font-semibold text-foreground"
                    : "text-foreground/80")
                }
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SitePreview() {
  return (
    <div className="w-full max-w-md lg:w-[24rem]">
      <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)]">
        <div className="flex h-7 items-center gap-1.5 border-b border-black/[0.05] bg-zinc-50/80 px-3">
          <span className="size-1.5 rounded-full bg-zinc-300" />
          <span className="size-1.5 rounded-full bg-zinc-300" />
          <span className="size-1.5 rounded-full bg-zinc-300" />
          <span className="ml-2 truncate font-mono text-[9px] text-muted-foreground">
            serviceflow.ph/beautyfeel
          </span>
        </div>
        <div className="space-y-3 p-4">
          <div className="h-3 w-2/3 rounded-full bg-zinc-200" />
          <div className="h-2 w-full rounded-full bg-zinc-100" />
          <div className="h-2 w-5/6 rounded-full bg-zinc-100" />
          <div className="grid grid-cols-3 gap-2 pt-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="aspect-square rounded-md bg-gradient-to-br from-primary/10 to-primary/[0.04]"
              />
            ))}
          </div>
          <div className="mt-2 inline-flex h-7 items-center rounded-full bg-primary px-3 text-[10px] font-semibold text-primary-foreground">
            Book now
          </div>
        </div>
      </div>
    </div>
  );
}
