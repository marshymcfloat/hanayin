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
    <section className="relative w-full flex flex-col" id="how-it-works">
      {/* Top curvy SVG */}
      <div className="w-full h-[120px] sm:h-[180px] md:h-[280px] leading-none z-0 overflow-hidden relative -mb-px">
        <svg
          viewBox="0 0 960 540"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="block h-full w-[102%] -translate-x-[1%]"
        >
          <rect x="-4" y="0" width="968" height="540" fill="#FAFAFA" />
          <path
            d="M-4 215C95 370 235 475 380 390C520 305 635 465 790 325C875 248 928 322 964 370L964 560L-4 560Z"
            fill="#00A63E"
          />
        </svg>
      </div>

      <div className="bg-[#00A63E] py-8 md:py-16 relative z-10 w-full">
        <div className="container mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6 text-white">
              Get Started in{" "}
              <span className="text-green-200">3 Simple Steps</span>
            </h2>
            <p className="text-xl text-green-50">
              No technical skills required. We help you set up for free.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative max-w-5xl mx-auto">
            {/* Connector Line (Desktop) */}
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-transparent -z-10 border-t-2 border-dashed border-white/30" />

            {steps.map((step, index) => (
              <div
                key={index}
                className="flex flex-col items-center text-center group text-white"
              >
                <div className="size-24 rounded-full bg-white/10 backdrop-blur-sm border-4 border-white/20 shadow-lg flex items-center justify-center mb-6 relative z-10 group-hover:border-white/40 transition-colors duration-300 group-hover:shadow-white/20">
                  <step.icon className="size-10 text-white" />
                  <div className="absolute -top-2 -right-2 size-8 rounded-full bg-white text-green-600 flex items-center justify-center font-bold shadow-md transform group-hover:scale-110 transition-transform duration-300">
                    {step.number}
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-green-50 leading-relaxed max-w-xs mx-auto">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Button
              asChild
              size="lg"
              className="rounded-full px-8 h-12 text-base font-semibold bg-white text-green-700 hover:bg-gray-100 shadow-lg shadow-black/10 hover:shadow-black/20 hover:scale-105 transition-all"
            >
              <Link href="/apply">
                Apply Now <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom curvy SVG */}
      <div className="w-full h-[60px] sm:h-[100px] md:h-[160px] lg:h-[220px] leading-none z-0 overflow-hidden relative -mt-px">
        <svg
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="block h-full w-[102%] -translate-x-[1%]"
        >
          <path
            fill="#FAFAFA"
            fillOpacity="1"
            d="M0,96L48,112C96,128,192,160,288,144C384,128,480,64,576,64C672,64,768,128,864,160C960,192,1056,192,1152,176C1248,160,1344,128,1392,112L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          ></path>
          <path
            fill="#00A63E"
            fillOpacity="1"
            d="M0,96L48,112C96,128,192,160,288,144C384,128,480,64,576,64C672,64,768,128,864,160C960,192,1056,192,1152,176C1248,160,1344,128,1392,112L1440,96L1440,0L1392,0C1344,0,1248,0,1152,0C1056,0,960,0,864,0C768,0,672,0,576,0C480,0,384,0,288,0C192,0,96,0,48,0L0,0Z"
          ></path>
        </svg>
      </div>
    </section>
  );
}
