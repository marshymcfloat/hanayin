"use client";

import { ArrowRight, UserPlus, Share2, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const steps = [
  {
    number: "1",
    title: "Set Up Your Business",
    description: "Add services, staff, prices, and schedules.",
    icon: UserPlus,
  },
  {
    number: "2",
    title: "Share Your Booking Link",
    description: "Put it on Facebook, Instagram, Google, and QR codes.",
    icon: Share2,
  },
  {
    number: "3",
    title: "Get Booked Automatically",
    description: "Clients book 24/7. System reminds them. You earn.",
    icon: CalendarCheck,
  },
];

export default function HowItWorksSection() {
  return (
    <section
      className="py-24 bg-stone-50 dark:bg-stone-900/10 relative overflow-hidden"
      id="how-it-works"
    >
      {/* Smooth Transition from Previous Section */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-background to-transparent pointer-events-none" />

      {/* Subtle Green Gradient Background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.05) 0%, rgba(255, 255, 255, 0) 70%)",
        }}
      />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Get Started in{" "}
            <span className="text-green-600">3 Simple Steps</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            No technical skills required. We help you set up for free.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative max-w-5xl mx-auto">
          {/* Connector Line (Desktop) */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-border -z-10 border-t-2 border-dashed border-muted-foreground/30" />

          {steps.map((step, index) => (
            <div
              key={index}
              className="flex flex-col items-center text-center group"
            >
              <div className="size-24 rounded-full bg-background border-4 border-green-50 shadow-lg flex items-center justify-center mb-6 relative z-10 group-hover:border-green-100 transition-colors duration-300 group-hover:shadow-green-100/50">
                <step.icon className="size-10 text-green-600" />
                <div className="absolute -top-2 -right-2 size-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold shadow-md transform group-hover:scale-110 transition-transform duration-300">
                  {step.number}
                </div>
              </div>
              <h3 className="text-xl font-bold mb-3">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed max-w-xs mx-auto">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center mt-16">
          <Button
            asChild
            size="lg"
            className="rounded-full px-8 h-12 text-base font-semibold bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200/50 hover:shadow-green-300/50 hover:scale-105 transition-all"
          >
            <Link href="/apply">
              Apply Now <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Bottom transition aid */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-background/50 to-transparent pointer-events-none" />
    </section>
  );
}
