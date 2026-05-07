"use client";

import { motion } from "motion/react";

/**
 * Founder note — single editorial card. Keeps the copy in first person
 * (Daniel) the way the original /about page already framed it. No
 * fabricated bio, no fake credentials.
 */
export default function FounderNoteSection() {
  return (
    <section className="border-y border-black/[0.06] bg-foreground/[0.015]">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24 lg:py-28">
        <motion.figure
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-7"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/50">
            A note from the team
          </p>

          <blockquote className="text-balance text-2xl font-medium leading-snug tracking-[-0.01em] text-foreground sm:text-[28px] lg:text-[32px]">
            &ldquo;I wanted to build something a salon owner could open on a
            Monday morning and feel like the software was on their side. That
            is still the goal — every feature gets measured against it.&rdquo;
          </blockquote>

          <figcaption className="flex items-center gap-3 pt-2">
            <span
              aria-hidden
              className="grid size-10 place-items-center rounded-full bg-foreground text-sm font-semibold text-background"
            >
              DC
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Daniel Canoy
              </span>
              <span className="text-xs text-foreground/55">
                Founder · Full-stack developer
              </span>
            </span>
          </figcaption>
        </motion.figure>
      </div>
    </section>
  );
}
