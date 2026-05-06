"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Set up your business",
    description:
      "Add services, prices, staff, and schedules. Our team helps with the import.",
  },
  {
    number: "02",
    title: "Share your booking link",
    description:
      "Drop it on Facebook, Instagram, Google, or behind a QR code at the counter.",
  },
  {
    number: "03",
    title: "Get booked, automatically",
    description:
      "Customers book 24/7. The system reminds them. You show up to a full day.",
  },
];

// Same noise generator as FinalCTA — keeps texture identical across both
// green moments on the page.
const NOISE_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
  );

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden scroll-mt-24 sm:scroll-mt-28"
    >
      <div className="relative bg-gradient-to-br from-primary via-emerald-700 to-emerald-900">
        {/* Grain overlay */}
        <div
          aria-hidden
          style={{ backgroundImage: `url("${NOISE_SVG}")` }}
          className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay"
        />
        {/* Soft white radial highlight at top-right for atmosphere */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 right-1/4 size-[600px] translate-x-1/2 rounded-full bg-white/10 blur-[120px]"
        />
        {/* Faint diagonal grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,black_30%,transparent_100%)]"
        />

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-32">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto max-w-3xl text-center"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100/80">
              How it works
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-white sm:text-4xl lg:text-5xl">
              Live in an afternoon.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-emerald-50/90 sm:text-lg">
              No technical skills required. Most owners are taking bookings
              within hours of signing up.
            </p>
          </motion.div>

          {/* Steps. Mobile: vertical stack. Desktop: 3 columns connected by
              a hairline white rule. */}
          <div className="relative mt-14 sm:mt-16 lg:mt-20">
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-white/20 to-transparent lg:block"
            />
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-12">
              {steps.map((step, i) => (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{
                    duration: 0.5,
                    ease: [0.16, 1, 0.3, 1],
                    delay: i * 0.1,
                  }}
                  className="relative"
                >
                  <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                    <span className="font-mono text-xs font-semibold tracking-[0.05em] text-white">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em] text-white sm:text-xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-emerald-50/85 sm:text-base">
                    {step.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-14 flex justify-center sm:mt-16"
          >
            <Link
              href="/apply"
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-emerald-900 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] transition-all hover:bg-emerald-50 active:scale-[0.98]"
            >
              Apply now
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
