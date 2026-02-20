"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const tiers = [
  {
    name: "Starter",
    price: "\u20B11,499",
    description: "For teams running day-to-day operations in one place.",
    features: [
      "Online booking flow",
      "Service + package catalog",
      "Customer CRM and history",
      "Automated booking reminders",
      "Employee and owner management",
      "Attendance, leave, and payroll",
      "Vouchers and gift cards",
      "Business hours and booking policy controls",
      "Sale events and promo engine",
      "Re-engagement and service-flow reminders",
      "Billing and referral dashboard",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Plus",
    price: "\u20B12,499",
    description: "For businesses ready to grow with web presence and insights.",
    features: [
      "Everything in Starter",
      "Public booking website page",
      "Growth opportunity insights and workflow (manual mode)",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Pro",
    price: "\u20B13,999",
    description: "For advanced marketing automation and social execution.",
    features: [
      "Everything in Plus",
      "Direct social media publishing (pilot rollout)",
      "AI caption generation",
      "AI promo image generation",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
];

export default function PricingSection() {
  return (
    <section
      className="py-24 bg-[#FAFAFA] relative overflow-hidden"
      id="pricing"
    >
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Simple Pricing for{" "}
            <span className="text-green-600">Growing Businesses</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            No contracts. No hidden fees. Cancel anytime.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-3xl p-8 border ${
                tier.popular
                  ? "border-green-500 shadow-2xl scale-105 z-10 bg-background shadow-green-200/50 ring-4 ring-green-500/10"
                  : "border-border bg-stone-50 dark:bg-stone-900/20 hover:border-green-200/50 hover:shadow-lg hover:shadow-green-900/5 transition-all"
              } flex flex-col`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-md shadow-green-600/20">
                  Most Popular
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2">{tier.name}</h3>
                <p className="text-muted-foreground text-sm mb-6 h-10">
                  {tier.description}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8 flex-1">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <Check className="size-5 text-green-600 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className={`w-full rounded-full h-12 font-semibold ${
                  tier.popular
                    ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200/50 hover:shadow-green-300/50 hover:scale-105 transition-all"
                    : "bg-surface hover:bg-muted variant-outline border-border hover:border-green-200 hover:text-green-700"
                }`}
                variant={tier.popular ? "default" : "outline"}
              >
                <Link href="/apply">{tier.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
