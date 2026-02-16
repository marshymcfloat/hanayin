"use client";

import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function FinalCTASection() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background with gradient */}
      <div className="absolute inset-0 bg-green-600 dark:bg-green-700 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px]">
        <div className="absolute inset-0 bg-linear-to-r from-green-600/90 to-emerald-600/90 backdrop-blur-sm" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10 text-center text-white">
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
            className="rounded-full h-14 px-8 text-lg font-medium border-white/30 bg-transparent text-white hover:bg-white/10 hover:border-white backdrop-blur-sm gap-2 transition-all w-full sm:w-auto"
          >
            <Link href="/explore">
              <Compass className="size-5" /> Explore Businesses
            </Link>
          </Button>
        </div>

        <p className="mt-8 text-sm text-green-100 opacity-80">
          No credit card required • Cancel anytime • Free setup assistance
        </p>
      </div>
    </section>
  );
}
