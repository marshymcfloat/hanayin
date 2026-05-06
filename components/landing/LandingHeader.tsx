"use client";

import AuthDialog from "@/components/auth/AuthDialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export default function LandingHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (!isHome) return;
    const element = document.getElementById(id);
    if (!element) return;
    e.preventDefault();

    // Sticky-header height when scrolled (capsule mode is ~56px tall, lives
    // at top-3 = +12px). Plus a small breathing gap so the section eyebrow
    // sits below the header, not glued to it.
    const headerOffset = -88;

    const lenis = window.__lenis;
    if (lenis) {
      // Route through Lenis so the smooth-scroll engine drives the
      // animation instead of racing native scroll.
      lenis.scrollTo(element, { offset: headerOffset });
    } else {
      // Fallback for users with `prefers-reduced-motion` (Lenis disabled)
      // or first-paint races. Still respects the header-height offset.
      const rect = element.getBoundingClientRect();
      window.scrollTo({
        top: window.scrollY + rect.top + headerOffset,
        behavior: "smooth",
      });
    }
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex justify-center transition-all duration-300",
        scrolled ? "px-3 sm:px-4 pt-3" : "px-0 pt-0",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between w-full transition-all duration-300 ease-out",
          scrolled
            ? "max-w-5xl rounded-full border border-black/[0.06] bg-white/80 backdrop-blur-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)] px-4 sm:px-5 h-14"
            : "max-w-7xl border border-transparent px-4 sm:px-6 lg:px-8 h-20",
        )}
      >
        <Link
          href="/#hero"
          onClick={(e) => handleScroll(e, "hero")}
          className="flex items-center gap-2 group"
        >
          <div
            className={cn(
              "relative transition-all duration-300",
              scrolled ? "size-7" : "size-8 md:size-9",
            )}
          >
            <Image
              src="/serviceFlow-logo.png"
              alt="ServiceFlow"
              fill
              sizes="(min-width: 768px) 36px, 32px"
              className="rounded-lg object-cover"
            />
          </div>
          <span
            className={cn(
              "font-semibold tracking-tight text-foreground transition-all duration-300",
              scrolled ? "text-base" : "text-lg",
            )}
          >
            ServiceFlow
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 absolute left-1/2 -translate-x-1/2">
          <Link
            href="/#features"
            onClick={(e) => handleScroll(e, "features")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </Link>
          <Link
            href="/#how-it-works"
            onClick={(e) => handleScroll(e, "how-it-works")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            How it works
          </Link>
          <Link
            href="/#pricing"
            onClick={(e) => handleScroll(e, "pricing")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            About
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <AuthDialog>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-full text-foreground/80 hover:text-foreground hover:bg-foreground/[0.04] cursor-pointer transition-all",
                scrolled ? "h-8 px-3 text-sm" : "h-9 px-4 text-sm",
              )}
            >
              Sign in
            </Button>
          </AuthDialog>
          <Button
            asChild
            size="sm"
            className={cn(
              "rounded-full bg-foreground text-background hover:bg-foreground/90 cursor-pointer shadow-sm transition-all",
              scrolled ? "h-8 px-4 text-sm" : "h-9 px-5 text-sm",
            )}
          >
            <Link href="/apply">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
