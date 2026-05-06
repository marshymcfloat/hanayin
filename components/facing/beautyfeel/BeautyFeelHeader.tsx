"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface BeautyFeelHeaderNavItem {
  label: string;
  href: string;
}

export interface BeautyFeelHeaderProps {
  businessName: string;
  businessSlug: string;
  navItems: BeautyFeelHeaderNavItem[];
}

/**
 * Morphing sticky header for the BeautyFeel facing page.
 *
 *  - At the top of the page (over the dark full-bleed hero image), the
 *    bar is fully transparent and all text/buttons render in cream so
 *    they read against the imagery.
 *  - Once the user scrolls past the hero (~24px is enough since the
 *    transition feels best when it kicks in early), the bar morphs to a
 *    frosted-cream pane with dark text — same look as the previous
 *    server-rendered version.
 *
 * Smooth `transition-all duration-300` between the two states.
 */
export default function BeautyFeelHeader({
  businessName,
  businessSlug,
  navItems,
}: BeautyFeelHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all duration-300",
        scrolled
          ? "border-b border-black/[0.06] bg-[color:var(--bf-cream)]/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6 sm:h-20">
        <Link
          href={`/${businessSlug}`}
          className={cn(
            "font-[var(--font-serif)] text-xl font-normal tracking-[-0.005em] transition-colors sm:text-2xl",
            scrolled
              ? "text-[color:var(--bf-ink)]"
              : "text-[color:var(--bf-cream)] [text-shadow:0_1px_2px_rgba(0,0,0,0.25)]",
          )}
        >
          {businessName}
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => {
            const hasHash = item.href.includes("#");
            const resolvedHref = item.href.startsWith("#")
              ? `/${businessSlug}${item.href}`
              : item.href;

            const linkClass = cn(
              "font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
              scrolled
                ? "text-[color:var(--bf-muted)] hover:text-[color:var(--bf-ink)]"
                : "text-[color:var(--bf-cream)]/85 hover:text-[color:var(--bf-cream)]",
            );

            if (hasHash) {
              return (
                <a key={item.href} href={resolvedHref} className={linkClass}>
                  {item.label}
                </a>
              );
            }
            return (
              <Link key={item.href} href={resolvedHref} className={linkClass}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href={`/${businessSlug}/booking`} scroll={false}
          className={cn(
            "group inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-medium tracking-wide transition-all active:scale-[0.98] sm:h-10 sm:px-5 sm:text-sm",
            scrolled
              ? "bg-[color:var(--bf-ink)] text-[color:var(--bf-cream)] hover:bg-[color:var(--bf-ink)]/90"
              : "border border-[color:var(--bf-cream)]/40 bg-[color:var(--bf-cream)]/15 text-[color:var(--bf-cream)] backdrop-blur-md hover:bg-[color:var(--bf-cream)]/25",
          )}
        >
          Book
          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 sm:size-4" />
        </Link>
      </div>
    </header>
  );
}
