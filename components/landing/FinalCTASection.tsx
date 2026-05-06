"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";

// Tiny SVG noise generator inlined as a data URL. Used as a low-opacity
// overlay to give the green block a subtle grain — adds depth without
// images.
const NOISE_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
  );

export default function FinalCTASection() {
  return (
    <section className="relative overflow-hidden">
      {/* Outer container has the deep-green gradient. Top-left lifts to
          a brighter primary; bottom-right deepens to emerald-900. */}
      <div className="relative bg-gradient-to-br from-primary via-emerald-700 to-emerald-900">
        {/* Grain overlay — purely decorative */}
        <div
          aria-hidden
          style={{ backgroundImage: `url("${NOISE_SVG}")` }}
          className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay"
        />

        {/* Soft radial highlight at top-left for depth */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/4 size-[600px] -translate-x-1/2 rounded-full bg-white/10 blur-[120px]"
        />

        {/* Diagonal hairline grid (very faint) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,black_30%,transparent_100%)]"
        />

        <div className="relative mx-auto max-w-3xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100/80">
              Ready when you are
            </p>
            <h2 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl">
              Run a calmer salon. Starting today.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-emerald-50/90 sm:text-lg">
              Set up your business in an afternoon. We&apos;ll help — even
              import your old client list for you.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/apply"
                className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-emerald-900 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] transition-all hover:bg-emerald-50 active:scale-[0.98]"
              >
                Start free trial
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/explore"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/10"
              >
                Browse live businesses
              </Link>
            </div>

            <p className="mt-7 text-xs text-emerald-100/70">
              14-day trial · No credit card required · Free setup help
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
