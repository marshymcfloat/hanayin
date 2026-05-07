"use client";

import { motion } from "motion/react";

/**
 * About hero — same editorial pattern as the landing HeroSection but
 * trimmed: a section pill, a balanced headline, and a single paragraph.
 * Background is the dot grid + soft brand-green glow used elsewhere on
 * the marketing site so /about visually belongs to the same family.
 */
export default function AboutHeroSection() {
  return (
    <section
      id="about-hero"
      className="relative isolate pt-36 pb-16 sm:pt-40 sm:pb-20 md:pt-44 md:pb-24"
    >
      {/* Dot grid background, masked to a soft ellipse. overflow-hidden
          stays only on this layer so the dots don't bleed past the
          section while the brand glow below can extend freely. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [background-image:radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black_40%,transparent_100%)]"
      />
      {/* Soft brand-green glow behind the headline. Wider-than-tall
          ellipse so the visible edge fades softly along the section
          rather than reading as a clipped circle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-20 -z-10 h-[640px] w-[1100px] max-w-[120vw] -translate-x-1/2 rounded-[50%] bg-primary/15 blur-[140px]"
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/70 px-3 py-1 text-xs font-medium text-foreground/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-primary" />
            <span>About ServiceFlow</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="mt-7 mx-auto max-w-3xl text-balance text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-5xl lg:text-6xl"
        >
          Two builders.{" "}
          <span className="text-foreground/55">One platform.</span> Built for
          the Philippines.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-foreground/65 sm:text-lg"
        >
          ServiceFlow is a small operations platform for Philippine salons,
          barbershops, and spas — bookings, payroll, reports, and growth
          campaigns on one signed-in surface.
        </motion.p>
      </div>
    </section>
  );
}
