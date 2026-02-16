"use client";

import Image from "next/image";

export default function ProductPreviewSection() {
  return (
    <section className="py-24 bg-stone-50 dark:bg-stone-900/10 relative overflow-hidden">
      {/* Smooth Transition Top */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-background to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Your Business <span className="text-green-600">Dashboard</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Clean. Simple. Powerful.
          </p>
        </div>

        <div className="relative max-w-5xl mx-auto">
          {/* Green Glow behind image */}
          <div className="absolute -inset-4 bg-green-500/20 blur-3xl rounded-[3rem] -z-10 opacity-50" />

          {/* Main Dashboard Image */}
          <div className="rounded-3xl overflow-hidden shadow-2xl border border-border/50 bg-background relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Using a placeholder if actual asset is not perfect, but leveraging sfasset1.png as requested */}
            <Image
              src="/sfasset1.png"
              alt="ServiceFlow Dashboard Preview"
              width={1200}
              height={800}
              className="w-full h-auto object-cover"
              priority
            />
            {/* Overlay Gradient for depth */}
            <div className="absolute inset-0 bg-linear-to-t from-black/5 to-transparent pointer-events-none" />
          </div>

          {/* Floating UI Elements for "Wow" factor */}
          <div className="absolute -right-8 -bottom-12 md:-right-16 md:-bottom-20 z-20 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300 hidden md:block">
            <div className="bg-white dark:bg-stone-800 p-4 rounded-2xl shadow-xl border border-border/50 max-w-xs">
              <div className="flex items-center gap-3 mb-3">
                <div className="size-10 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700">
                  M
                </div>
                <div>
                  <div className="font-semibold text-sm">New Booking</div>
                  <div className="text-xs text-muted-foreground">Just now</div>
                </div>
              </div>
              <div className="text-sm">
                <span className="font-medium">Maria S.</span> booked{" "}
                <span className="text-green-600 font-medium">
                  Haircut & Color
                </span>{" "}
                for tomorrow at 2 PM.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
