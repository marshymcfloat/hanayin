"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

const before = [
  "Notebook for appointments",
  "Excel for payroll",
  "Messenger DMs to confirm",
  "Viber for reminders",
  "Calculator for commissions",
  "Sticky notes for promos",
];

const after = [
  "Online booking, 24/7",
  "Auto-calculated payroll",
  "One inbox for every booking",
  "SMS + email reminders, automated",
  "Commissions tracked per service",
  "Promo engine with smart targeting",
];

export default function PainPointsSection() {
  return (
    <section className="relative py-20 sm:py-28 lg:py-36">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            From chaos to clarity
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-4xl lg:text-5xl">
            Stop running your business{" "}
            <span className="text-muted-foreground/70">across six apps.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            ServiceFlow folds every tool you&apos;re juggling into one calm
            workspace, designed around how salons actually run.
          </p>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 gap-10 sm:mt-16 lg:mt-20 lg:grid-cols-2 lg:gap-16">
          {/* BEFORE */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              What you&apos;re juggling now
            </h3>
            <ul className="mt-6 space-y-3">
              {before.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-base text-muted-foreground/80 line-through decoration-muted-foreground/30 sm:text-lg"
                >
                  <span
                    aria-hidden
                    className="mt-2 inline-block size-1.5 shrink-0 rounded-full bg-muted-foreground/30"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* AFTER — visually elevated with a soft tinted backdrop */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{
              duration: 0.6,
              ease: [0.16, 1, 0.3, 1],
              delay: 0.1,
            }}
            className="relative"
          >
            {/* Subtle green spotlight behind the "after" list */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-6 -inset-y-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent"
            />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              What ServiceFlow gives you
            </h3>
            <ul className="mt-6 space-y-3">
              {after.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-base font-medium text-foreground sm:text-lg"
                >
                  <span
                    aria-hidden
                    className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-14 flex justify-center"
        >
          <Link
            href="#features"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            See how it works
            <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
