import Link from "next/link";
import BeautyFeelHeader from "./BeautyFeelHeader";
import SmoothScroll from "@/components/landing/SmoothScroll";

export interface BeautyFeelNavItem {
  label: string;
  href: string;
}

export interface BeautyFeelShellProps {
  businessName: string;
  businessSlug: string;
  navItems: BeautyFeelNavItem[];
  children: React.ReactNode;
}

export default function BeautyFeelShell({
  businessName,
  businessSlug,
  navItems,
  children,
}: BeautyFeelShellProps) {
  return (
    <div className="min-h-screen bg-[color:var(--bf-cream)] text-[color:var(--bf-ink)] [--bf-cream:oklch(0.98_0.01_92)] [--bf-ink:oklch(0.2_0.02_62)] [--bf-muted:oklch(0.52_0.02_75)] [--bf-blush:oklch(0.92_0.03_35)] [--bf-accent:oklch(0.86_0.08_38)] [--bf-sage:oklch(0.76_0.05_148)]">
      {/* Lenis smooth-scroll mounted globally for this facing site.
          Reused from the marketing pages — handles `prefers-reduced-motion`
          internally and exposes the instance on `window.__lenis`. */}
      <SmoothScroll />

      {/* Morphing client header — transparent over the hero image,
          frosted cream once scrolled. */}
      <BeautyFeelHeader
        businessName={businessName}
        businessSlug={businessSlug}
        navItems={navItems}
      />

      {children}

      {/* Footer — quiet, hairline, small caps */}
      <footer className="border-t border-black/[0.06] bg-[color:var(--bf-cream)]">
        <div className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
            <div>
              <p className="font-[var(--font-serif)] text-2xl font-normal italic tracking-[-0.005em] text-[color:var(--bf-ink)] sm:text-3xl">
                {businessName}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--bf-muted)]">
                Quiet care · Puerto Princesa, Palawan
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--bf-muted)]">
              <Link
                href={`/${businessSlug}`}
                className="transition-colors hover:text-[color:var(--bf-ink)]"
              >
                Home
              </Link>
              <Link
                href={`/${businessSlug}/services`}
                className="transition-colors hover:text-[color:var(--bf-ink)]"
              >
                Services
              </Link>
              <Link
                href={`/${businessSlug}/booking`} scroll={false}
                className="transition-colors hover:text-[color:var(--bf-ink)]"
              >
                Book
              </Link>
              <Link
                href={`/${businessSlug}/claim-gift-card`} scroll={false}
                className="transition-colors hover:text-[color:var(--bf-ink)]"
              >
                Gift card
              </Link>
            </nav>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-black/[0.06] pt-6 text-xs text-[color:var(--bf-muted)] md:flex-row md:items-center">
            {/* Hardcoded — `new Date()` in server components is incompatible
                with cacheComponents. Bump this manually each new year. */}
            <span>© 2026 {businessName}. All rights reserved.</span>
            <span className="font-mono uppercase tracking-[0.18em]">
              On Service Flow
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
