"use client";

import { motion } from "motion/react";

/**
 * Principles — three value statements that double as design constraints.
 * Each tile is a short paragraph, no metrics, no fabricated claims. Layout
 * mirrors the landing page's signature three-up section so the marketing
 * site and /about feel like the same document.
 */
const PRINCIPLES = [
  {
    eyebrow: "I",
    title: "Local, not localized.",
    body: "Built in the Philippines, for the Philippines. Currency, cash flow, the way operators actually run their floors — these are the defaults, not a settings page bolted on later.",
  },
  {
    eyebrow: "II",
    title: "Small by design.",
    body: "A two-person team means decisions stay close to the product. Less committee, less roadmap theater, more time spent on the things an operator notices on a Tuesday.",
  },
  {
    eyebrow: "III",
    title: "Operations first.",
    body: "Bookings, payroll, reports, and the customer-facing booking site live on one surface. We resist adding features that look good in screenshots but don't earn their place on the floor.",
  },
];

export default function PrinciplesSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
      <div className="max-w-2xl space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/50">
          What we believe
        </p>
        <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-4xl lg:text-[44px]">
          Three constraints we keep coming back to.
        </h2>
      </div>

      <ol className="mt-12 grid grid-cols-1 gap-6 sm:mt-14 sm:grid-cols-3 sm:gap-7">
        {PRINCIPLES.map((p, i) => (
          <motion.li
            key={p.eyebrow}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{
              duration: 0.6,
              ease: [0.16, 1, 0.3, 1],
              delay: i * 0.07,
            }}
            className="group relative flex flex-col rounded-2xl border border-black/[0.06] bg-background p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:border-black/[0.12] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.1)] sm:p-7"
          >
            <span className="font-mono text-xs font-medium tracking-[0.2em] text-foreground/45">
              {p.eyebrow}
            </span>
            <h3 className="mt-4 text-xl font-semibold leading-snug tracking-[-0.01em] text-foreground sm:text-[22px]">
              {p.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-foreground/65">
              {p.body}
            </p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
