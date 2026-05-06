"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  Share2,
  Globe,
  BarChart3,
  Check,
} from "lucide-react";
import Image from "next/image";

const surfaces = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Today's bookings, revenue, and team — one screen.",
    points: [
      "Live booking feed",
      "Real-time revenue",
      "Staff overview",
      "Quick actions",
    ],
    image: "/SF_Dashboard.png",
    aspect: "aspect-[1919/948]",
  },
  {
    id: "social",
    label: "Social",
    icon: Share2,
    description: "Post to FB & IG without leaving ServiceFlow.",
    points: [
      "Schedule posts",
      "AI captions",
      "Cross-platform publish",
      "Engagement tracking",
    ],
    image: "/SF_Post.png",
    aspect: "aspect-[1919/948]",
  },
  {
    id: "website",
    label: "Public site",
    icon: Globe,
    description: "Your booking storefront, ready to share.",
    points: [
      "Customizable theme",
      "Live booking widget",
      "Mobile-optimized",
      "SEO ready",
    ],
    image: "/SF_Facing.png",
    aspect: "aspect-[1919/948]",
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    description: "Find the slow days. Find the best sellers.",
    points: [
      "Custom report builder",
      "Export anywhere",
      "Trend analysis",
      "Inventory insights",
    ],
    image: "/SF_Reports.png",
    aspect: "aspect-[1919/948]",
  },
];

export default function IndustryUseCasesSection() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28 lg:py-32 bg-zinc-50/60">

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Product tour
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-4xl lg:text-5xl">
            Four surfaces. One shared truth.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            Click through the actual product. Every screen below is the real
            ServiceFlow — not a mockup.
          </p>
        </motion.div>

        <Tabs defaultValue="dashboard" className="mt-12 sm:mt-16">
          {/* Tabs as individual rounded-full pills that wrap naturally.
              Each pill carries its own bg/border so wrapping looks
              intentional (vs one big container that bulges into a second
              row). The TabsList itself is just a flex-wrap row. */}
          <TabsList className="flex h-auto w-full flex-wrap items-center justify-center gap-2 bg-transparent p-0">
            {surfaces.map((s) => (
              <TabsTrigger
                key={s.id}
                value={s.id}
                className="cursor-pointer whitespace-nowrap rounded-full border border-black/[0.06] bg-white/80 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-sm transition-all hover:text-foreground data-[state=active]:border-transparent data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm sm:px-4 sm:text-sm"
              >
                <s.icon className="mr-1.5 size-3.5 sm:size-4" />
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {surfaces.map((s) => (
            <TabsContent
              key={s.id}
              value={s.id}
              className="mt-10 outline-none"
            >
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_1fr] lg:items-center lg:gap-12"
              >
                <div>
                  <h3 className="text-balance text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">
                    {s.description}
                  </h3>
                  <ul className="mt-5 space-y-2.5">
                    {s.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2 text-sm text-foreground/80 sm:text-base"
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white shadow-[0_24px_48px_-16px_rgba(0,0,0,0.15)]">
                  <div className="flex h-8 items-center gap-1.5 border-b border-black/[0.05] bg-zinc-50/80 px-3">
                    <span className="size-2 rounded-full bg-[#ff5f57]" />
                    <span className="size-2 rounded-full bg-[#febc2e]" />
                    <span className="size-2 rounded-full bg-[#28c840]" />
                  </div>
                  <div
                    className={`relative w-full bg-muted/30 ${s.aspect}`}
                  >
                    <Image
                      src={s.image}
                      alt={`${s.label} — ServiceFlow`}
                      fill
                      sizes="(max-width: 1024px) 100vw, 720px"
                      className="object-cover object-top"
                    />
                  </div>
                </div>
              </motion.div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
