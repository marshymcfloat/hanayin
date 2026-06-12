"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Compass } from "lucide-react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { useRef } from "react";

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  // Single parallax element: the "Built for PH" badge translates slightly
  // slower than scroll. Disabled when prefers-reduced-motion is on.
  const { scrollY } = useScroll();
  const badgeY = useTransform(scrollY, [0, 600], [0, reduced ? 0 : 60]);

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="relative isolate overflow-hidden pt-36 pb-0 md:pt-44"
    >
      {/* Dot grid background. Scoped to hero only via mask. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black_40%,transparent_100%)]"
      />

      {/* Soft brand-green radial glow behind headline. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-32 -z-10 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]"
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 text-center">
        {/* Parallax badge — the only parallax element on the page. */}
        <motion.div
          style={{ y: badgeY }}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/70 px-3 py-1 text-xs font-medium text-foreground/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-md">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            <span>Built for the Philippine beauty industry</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="mt-8 mx-auto max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-6xl lg:text-7xl"
        >
          The operating system{" "}
          <span className="bg-gradient-to-br from-primary to-emerald-700 bg-clip-text text-transparent">
            for your salon
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          Bookings, payroll, reminders, and growth tools — in one calm,
          reliable dashboard your team will actually use.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
        >
          <Link
            href="/apply"
            className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-emerald-700 px-6 text-sm font-medium text-white shadow-[0_1px_0_rgba(255,255,255,0.16)_inset,0_8px_20px_-10px_rgba(4,120,87,0.8)] transition-all hover:bg-emerald-800 active:scale-[0.98]"
          >
            Start free trial
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/explore"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/[0.08] bg-white/60 px-6 text-sm font-medium text-foreground/80 backdrop-blur-sm transition-all hover:bg-white/90 hover:text-foreground"
          >
            <Compass className="size-4" />
            Explore live businesses
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-6 text-xs text-muted-foreground"
        >
          No credit card required · 14-day trial · Free setup help
        </motion.p>
      </div>

      {/* Product screenshot peek — bottom of hero fades into next section.
          The screenshot is real (SF_Dashboard.png in /public). */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
        className="relative mx-auto mt-20 max-w-6xl px-4 sm:px-6"
      >
        <div className="relative rounded-2xl border border-black/[0.08] bg-white shadow-[0_24px_48px_-12px_rgba(0,0,0,0.18),0_0_0_1px_rgba(22,163,74,0.05)] overflow-hidden">
          {/* macOS-style window chrome */}
          <div className="flex h-9 items-center gap-1.5 border-b border-black/[0.06] bg-zinc-50/80 px-4">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
            <div className="ml-3 inline-flex h-5 items-center rounded-md bg-white/70 px-2 text-[10px] font-mono text-muted-foreground">
              app.serviceflow.ph
            </div>
          </div>
          <div className="relative aspect-[1919/948] w-full bg-muted/30">
            <Image
              src="/SF_Dashboard.png"
              alt="ServiceFlow dashboard preview"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover object-top"
            />
          </div>
        </div>
        {/* Soft fade-out gradient at bottom of screenshot — bleeds into next section */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background"
        />
      </motion.div>

      {/* Spacer so the fade-out reads correctly */}
      <div className="h-24" />
    </section>
  );
}
