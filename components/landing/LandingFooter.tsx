import Link from "next/link";
import Image from "next/image";
import { Facebook, Instagram, Twitter } from "lucide-react";

export default function LandingFooter() {
  return (
    <footer className="border-t border-black/[0.06] bg-zinc-50/40">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-10">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 group">
              <div className="relative size-7">
                <Image
                  src="/serviceFlow-logo.png"
                  alt="ServiceFlow"
                  fill
                  sizes="28px"
                  className="rounded-md object-cover"
                />
              </div>
              <span className="font-semibold tracking-tight text-foreground">
                ServiceFlow
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              The all-in-one operating system for salons, spas, and barbershops
              in the Philippines.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <a
                href="https://web.facebook.com/RosesRBlacc"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="flex size-8 items-center justify-center rounded-full border border-black/[0.06] bg-white text-muted-foreground transition-colors hover:text-foreground hover:bg-zinc-50"
              >
                <Facebook className="size-3.5" />
              </a>
              <Link
                href="#"
                aria-label="Instagram"
                className="flex size-8 items-center justify-center rounded-full border border-black/[0.06] bg-white text-muted-foreground transition-colors hover:text-foreground hover:bg-zinc-50"
              >
                <Instagram className="size-3.5" />
              </Link>
              <Link
                href="#"
                aria-label="Twitter"
                className="flex size-8 items-center justify-center rounded-full border border-black/[0.06] bg-white text-muted-foreground transition-colors hover:text-foreground hover:bg-zinc-50"
              >
                <Twitter className="size-3.5" />
              </Link>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
              Product
            </h4>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/#features"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="/#pricing"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/solutions"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Solutions
                </Link>
              </li>
              <li>
                <Link
                  href="/explore"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Explore
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
              Company
            </h4>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/about#contact"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/apply"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Apply
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
              Legal
            </h4>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

      </div>

      {/* Green bottom bar — brand stamp at the foot of the page. Same
          gradient as HowItWorks + FinalCTA so the green moments rhyme.
          Mobile: centered stacked. Desktop: split-justified copyright/links. */}
      <div className="relative overflow-hidden bg-gradient-to-r from-primary via-emerald-700 to-emerald-900">
        <div className="mx-auto flex max-w-6xl flex-col-reverse items-center justify-center gap-3 px-4 py-5 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:text-left">
          <p className="text-xs text-emerald-50/90">
            {/* Hardcoded — `new Date()` in server components is incompatible
                with cacheComponents. Bump this manually each new year. */}
            © 2026 ServiceFlow. All rights reserved.
          </p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs sm:justify-start">
            <Link
              href="/solutions/salon-software-manila"
              className="text-emerald-50/80 transition-colors hover:text-white"
            >
              Salon software Manila
            </Link>
            <Link
              href="/solutions/spa-booking-software-cebu"
              className="text-emerald-50/80 transition-colors hover:text-white"
            >
              Spa software Cebu
            </Link>
            <Link
              href="/solutions/multi-branch-salon-software-philippines"
              className="text-emerald-50/80 transition-colors hover:text-white"
            >
              Multi-branch salon software
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
