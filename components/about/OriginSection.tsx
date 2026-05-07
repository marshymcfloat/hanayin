"use client";

import { motion } from "motion/react";

/**
 * Origin — editorial split: sticky eyebrow + headline on the left,
 * narrative copy on the right. No fabricated dates or metrics; the
 * paragraphs are the same self-stated facts the previous /about page
 * carried (two-person team, founder is a full-stack developer, focus
 * on Philippine small businesses).
 */
export default function OriginSection() {
  return (
    <section className="border-y border-black/[0.06]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="lg:sticky lg:top-32 lg:self-start"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/50">
            Origin
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-4xl lg:text-[44px]">
            How ServiceFlow began.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-foreground/60">
            A short note on who we are and why we&apos;re building this.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{
            duration: 0.7,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.05,
          }}
          className="space-y-6 text-base leading-relaxed text-foreground/75 lg:text-[17px]"
        >
          <p>
            ServiceFlow is a two-person team — a full-stack developer and a
            friend — turning a long-running side project into something a salon
            owner can run their day on.
          </p>
          <p>
            We started because the existing options for a Philippine salon
            either felt like spreadsheet work pretending to be software, or like
            global SaaS bolted onto an industry it didn&apos;t understand.
            Bookings, payroll, reports, and the customer-facing site are all
            things one operator already juggles in their head — they should sit
            on one signed-in surface, not five.
          </p>
          <p>
            We&apos;re not chasing scale before the product earns it. We&apos;d
            rather ship something narrow and useful, listen to the small number
            of operators using it, and let the platform grow the way the floor
            actually works.
          </p>
          <p className="text-foreground/60">
            Thanks for reading. If you&apos;re curious where the product is
            headed, the contact details below go straight to us.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
