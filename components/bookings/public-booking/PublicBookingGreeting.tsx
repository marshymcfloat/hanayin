"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { CalendarClock } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * PublicBookingGreeting — sticky top of the customer booking page.
 *
 * Mirrors the employee portal's GreetingStrip pattern (same compact-on-
 * scroll behavior, same hairline frosted backdrop) but with content
 * tailored for an anonymous customer: business avatar + "Book at
 * <name>" headline + business-hours subline + optional right-hand
 * actions slot (where #8 will wire the "Earliest available" CTA).
 */
export interface PublicBookingGreetingProps {
  businessName: string;
  businessInitials: string;
  imageUrl?: string | null;
  /** Brief humanized hours line (e.g. "Mon–Sat · 9 AM – 6 PM"). Optional. */
  hoursSummary?: string | null;
  /** Right-hand action slot (e.g. "Book earliest available" CTA). */
  actions?: React.ReactNode;
}

const COMPACT_SCROLL_THRESHOLD = 48;
const SPRING = { duration: 0.32, ease: [0.16, 1, 0.3, 1] } as const;

export function PublicBookingGreeting({
  businessName,
  businessInitials,
  imageUrl,
  hoursSummary,
  actions,
}: PublicBookingGreetingProps) {
  const reduced = useReducedMotion();
  const [compact, setCompact] = React.useState(false);

  React.useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setCompact(window.scrollY > COMPACT_SCROLL_THRESHOLD);
        raf = 0;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const transition = reduced ? { duration: 0 } : SPRING;

  return (
    <motion.header
      className={cn(
        "sticky top-0 z-40 w-full",
        "border-b border-transparent",
        compact && "border-black/[0.06] bg-background/85 backdrop-blur",
      )}
      animate={{
        paddingTop: compact ? 10 : 18,
        paddingBottom: compact ? 10 : 18,
      }}
      transition={transition}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <motion.div
          animate={{ scale: compact ? 0.85 : 1 }}
          transition={transition}
          className="origin-left"
        >
          <Avatar
            className={cn(
              "border border-black/[0.06] shadow-sm shrink-0",
              compact ? "size-9" : "size-11",
            )}
          >
            {imageUrl ? <AvatarImage src={imageUrl} alt={businessName} /> : null}
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
              {businessInitials}
            </AvatarFallback>
          </Avatar>
        </motion.div>

        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Book at
          </p>
          <h1 className="truncate text-base font-semibold tracking-[-0.01em] text-foreground sm:text-lg">
            {businessName}
          </h1>
          {hoursSummary && !compact ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5 shrink-0" />
              <span className="truncate">{hoursSummary}</span>
            </p>
          ) : null}
        </div>

        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </motion.header>
  );
}
