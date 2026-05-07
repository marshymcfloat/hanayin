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
  /**
   * Tone the bar adopts at the very top of the page.
   *
   *  - `"adaptive"` (default): transparent + cream text initially, then
   *    morphs to a frosted-cream pane with dark text once the user
   *    scrolls past the hero. Use on pages whose hero is a dark
   *    full-bleed image.
   *  - `"solid"`: always renders the frosted-cream / dark-text state
   *    from scroll position 0. Use on pages whose hero is light (the
   *    booking and gift-card forms, etc.) where cream-on-cream is
   *    invisible.
   */
  variant?: "adaptive" | "solid";
}

/**
 * Sticky header for the BeautyFeel facing site.
 *
 * In `adaptive` mode the bar is transparent over a dark hero and
 * morphs to a frosted-cream pane after ~24px of scroll. In `solid`
 * mode it skips the transparent state entirely so contents stay
 * legible over light hero strips.
 */
export default function BeautyFeelHeader({
  businessName,
  businessSlug,
  navItems,
  variant = "adaptive",
}: BeautyFeelHeaderProps) {
  // In `solid` mode the bar always renders the scrolled state, so the
  // scroll listener is a no-op — derive `scrolled` directly from the
  // variant in that case and skip the effect entirely. Avoids a
  // setState-in-effect cascade and keeps the listener off the page
  // when it can't change anything.
  const [scrolledOnAdaptive, setScrolledOnAdaptive] = useState(false);
  const scrolled = variant === "solid" ? true : scrolledOnAdaptive;

  useEffect(() => {
    if (variant === "solid") return;
    const onScroll = () => setScrolledOnAdaptive(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

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
