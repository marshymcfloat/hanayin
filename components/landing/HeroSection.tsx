"use client";

import Link from "next/link";
import { ArrowRight, Compass, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function HeroSection() {
  return (
    <section
      className="relative isolate pt-32 pb-20 md:pb-32 overflow-hidden bg-[#FAFAFA]"
      id="hero"
    >
      <div
        className="absolute inset-0 z-0 pointer-events-none bg-[#FAFAFA]"
        aria-hidden="true"
      />

      <div className="relative z-10 container mx-auto px-4 sm:px-6 text-center">
        <div className="flex justify-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <Badge
            variant="outline"
            className="rounded-full px-4 py-1.5 border-green-200 bg-green-50/50 text-green-700 gap-2 hover:bg-green-100 transition-colors cursor-default backdrop-blur-sm font-medium text-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Built for local beauty businesses in the Philippines 🇵🇭
          </Badge>
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8 text-foreground animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards delay-100 leading-[1.1] max-w-5xl mx-auto">
          Run Your Salon Like a Pro.{" "}
          <span className="text-transparent bg-clip-text bg-linear-to-r from-green-600 via-emerald-500 to-teal-500">
            Book More.
          </span>{" "}
          Stress Less.
        </h1>

        <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards delay-200">
          All-in-one management system for salons, spas, clinics, and
          barbershops.
          <br className="hidden md:block" />
          Booking, payroll, reminders, and sales tools in one dashboard.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards delay-300">
          <Button
            asChild
            size="lg"
            className="rounded-full h-11 sm:h-14 px-5 sm:px-8 text-base sm:text-lg font-semibold shadow-lg shadow-green-200/50 hover:shadow-green-300/50 transition-all hover:scale-105 active:scale-95 w-full    max-w-[70vw] sm:w-auto"
          >
            <Link href="/apply">
              Start Trial + Book Demo{" "}
              <ArrowRight className="ml-2 size-4 sm:size-5" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-full h-11 sm:h-14 max-w-[70vw] px-5 sm:px-8 text-base sm:text-lg font-medium border-border/60 hover:bg-muted/50 backdrop-blur-sm gap-2 transition-all hover:scale-105 w-full sm:w-auto"
          >
            <Link href="/explore">
              <Compass className="size-4 sm:size-5" /> Explore Businesses
            </Link>
          </Button>
        </div>

        <div className="mt-8 animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-backwards delay-400">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground gap-2 group text-sm sm:text-base"
            asChild
          >
            <Link href="#how-it-works">
              <div className="size-7 sm:size-8 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <Play className="size-3 sm:size-3.5 text-green-700 fill-green-700 ml-0.5" />
              </div>
              Watch How It Works (2 min)
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
