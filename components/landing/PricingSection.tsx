"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Starter",
    price: "999",
    tagline: "Get online and start booking — today.",
    description:
      "Everything you need to replace the notebook, the Excel sheet, and the late-night Messenger replies.",
    features: [
      "Online booking flow",
      "Service + package catalog",
      "Customer CRM and history",
      "Automated booking reminders",
      "Employee and owner management",
      "Attendance, leave, and payroll",
      "Vouchers and gift cards",
      "Sale events and promo engine",
    ],
    cta: "Start free",
    popular: false,
  },
  {
    name: "Plus",
    price: "1,499",
    tagline: "Show up where customers actually search.",
    description:
      "Get a real booking website and growth nudges that quietly fill the empty slots in your week.",
    features: [
      "Everything in Starter",
      "Public booking website",
      "Growth opportunity insights",
      "Workflow automation (manual mode)",
    ],
    cta: "Try Plus free",
    popular: true,
  },
  {
    name: "Pro",
    price: "2,499",
    tagline: "Hand off your marketing entirely.",
    description:
      "AI writes the captions, designs the images, and schedules the posts — so you can focus on the chair.",
    features: [
      "Everything in Plus",
      "Direct social media publishing (pilot)",
      "AI caption generation",
      "AI promo image generation",
    ],
    cta: "Try Pro free",
    popular: false,
  },
];

export default function PricingSection() {
  return (
    <section
      id="pricing"
      className="relative isolate overflow-x-clip py-20 sm:py-28 lg:py-32 bg-zinc-50/60 scroll-mt-24 sm:scroll-mt-28"
    >
      {/* Primary-tinted spotlight behind the popular card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[700px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.10] blur-[140px]"
      />
      {/* Soft ambient brand-green glow at the very bottom for depth.
          Wide ellipse + larger blur so the edges fade inside the section
          rather than reading as a clipped circle when overflow-hidden
          crops the bottom. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 left-1/2 -z-10 h-[460px] w-[1200px] max-w-[140vw] -translate-x-1/2 rounded-[50%] bg-primary/[0.08] blur-[160px]"
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Pricing
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-4xl lg:text-5xl">
            Honest pricing. Built for{" "}
            <span className="bg-gradient-to-br from-primary to-emerald-700 bg-clip-text text-transparent">
              local businesses
            </span>
            .
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            Start free for 14 days. No card. No contract. Cancel with one
            click — we&apos;d rather you stay because it earns its keep.
          </p>
        </motion.div>

        {/* Cards — extra top padding so the centered Most-popular badge
            never collides with the eyebrow text on tight viewports. */}
        <div className="mt-16 grid grid-cols-1 gap-5 pt-4 sm:mt-20 md:grid-cols-3 md:gap-6">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
                delay: i * 0.05,
              }}
              className={cn(
                "relative flex flex-col rounded-2xl p-6 transition-all sm:p-8",
                tier.popular
                  ? // Popular: subtle warm-white-to-primary gradient, primary-tinted ring, deeper shadow.
                    "border border-primary/25 bg-gradient-to-br from-white via-white to-primary/[0.04] shadow-[0_24px_56px_-16px_rgba(22,163,74,0.28),0_0_0_1px_rgba(22,163,74,0.06)]"
                  : "border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-black/[0.10] hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.06)]",
              )}
            >
              {tier.popular && (
                <div className="pointer-events-none absolute -top-3.5 left-1/2 z-10 -translate-x-1/2">
                  <div className="relative inline-flex h-7 items-center rounded-full bg-gradient-to-br from-primary via-emerald-600 to-emerald-700 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_6px_16px_-2px_rgba(22,163,74,0.45),inset_0_1px_0_rgba(255,255,255,0.18)]">
                    Most popular
                  </div>
                </div>
              )}

              <div>
                <h3
                  className={cn(
                    "text-base font-semibold tracking-[-0.01em]",
                    tier.popular ? "text-primary" : "text-foreground",
                  )}
                >
                  {tier.name}
                </h3>
                <p className="mt-1.5 text-sm font-medium text-foreground/90">
                  {tier.tagline}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {tier.description}
                </p>

                <div className="mt-7 flex items-baseline gap-1">
                  <span className="text-base font-medium text-muted-foreground">
                    ₱
                  </span>
                  <span
                    className={cn(
                      "text-5xl font-semibold tracking-[-0.03em] tabular-nums sm:text-[3.25rem]",
                      tier.popular
                        ? "bg-gradient-to-br from-primary to-emerald-700 bg-clip-text text-transparent"
                        : "text-foreground",
                    )}
                  >
                    {tier.price}
                  </span>
                  <span className="ml-1 text-sm text-muted-foreground">
                    /mo
                  </span>
                </div>
              </div>

              <ul
                className={cn(
                  "mt-7 flex-1 space-y-2.5 border-t pt-6",
                  tier.popular
                    ? "border-primary/15"
                    : "border-black/[0.05]",
                )}
              >
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm text-foreground/85"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full",
                        tier.popular ? "bg-primary text-white" : "bg-primary/10 text-primary",
                      )}
                    >
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/apply"
                className={cn(
                  "group mt-7 inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium transition-all active:scale-[0.98]",
                  tier.popular
                    ? "bg-gradient-to-br from-primary to-emerald-700 text-white shadow-[0_8px_20px_-6px_rgba(22,163,74,0.45)] hover:shadow-[0_8px_24px_-6px_rgba(22,163,74,0.55)]"
                    : "border border-black/[0.08] bg-white text-foreground hover:border-foreground/40 hover:bg-zinc-50",
                )}
              >
                {tier.cta}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Prices in PHP. Annual plans available on request.
        </p>
      </div>
    </section>
  );
}
