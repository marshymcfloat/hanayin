"use client";

import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function FinalCTASection() {
  return (
    <section className="relative overflow-hidden bg-[#00A63E]">
      <div className="relative h-28 w-full sm:h-32 md:h-36 lg:h-40">
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

      <div className="container mx-auto px-4 sm:px-6 pb-24 pt-12 relative z-10 text-center text-white">
        <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
          Ready to Modernize <br className="hidden sm:block" /> Your Business?
        </h2>
        <p className="text-xl md:text-2xl text-green-50 mb-10 max-w-2xl mx-auto">
          Join hundreds of beauty professionals using ServiceFlow to work
          smarter, not harder.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            asChild
            size="lg"
            className="rounded-full h-14 px-8 text-lg font-bold bg-white text-green-700 hover:bg-green-50 shadow-xl hover:scale-105 transition-all w-full sm:w-auto"
          >
            <Link href="/apply">
              Start Trial + Book Demo <ArrowRight className="ml-2 size-5" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-full h-14 px-8 text-lg font-medium border-white/40 bg-transparent text-white hover:bg-white/10 hover:border-white backdrop-blur-sm gap-2 transition-all w-full sm:w-auto"
          >
            <Link href="/explore">
              <Compass className="size-5" /> Explore Businesses
            </Link>
          </Button>
        </div>

        <p className="mt-8 text-sm text-green-100 opacity-80">
          No credit card required | Cancel anytime | Free setup assistance
        </p>
      </div>
    </section>
  );
}
