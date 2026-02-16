"use client";

import Link from "next/link";
import Image from "next/image";
import { Facebook, Instagram, Twitter } from "lucide-react";

export default function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="py-12 border-t bg-stone-50 dark:bg-stone-900/10">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="relative size-8">
                <Image
                  src="/serviceFlow-logo.png"
                  alt="ServiceFlow"
                  fill
                  className="rounded-lg object-cover"
                />
              </div>
              <span className="font-bold text-lg tracking-tight group-hover:text-green-600 transition-colors">
                ServiceFlow
              </span>
            </Link>
            <p className="text-sm text-muted-foreground text-center md:text-left max-w-xs">
              The all-in-one management platform for salons, spas, and clinics
              in the Philippines 🇵🇭
            </p>
          </div>

          <div className="flex gap-8">
            <div className="flex flex-col gap-3 text-center md:text-left">
              <h4 className="font-semibold text-sm">Product</h4>
              <Link
                href="/#features"
                className="text-sm text-muted-foreground hover:text-green-600 transition-colors"
              >
                Features
              </Link>
              <Link
                href="/#pricing"
                className="text-sm text-muted-foreground hover:text-green-600 transition-colors"
              >
                Pricing
              </Link>
            </div>
            <div className="flex flex-col gap-3 text-center md:text-left">
              <h4 className="font-semibold text-sm">Company</h4>
              <Link
                href="/about"
                className="text-sm text-muted-foreground hover:text-green-600 transition-colors"
              >
                About
              </Link>
              <Link
                href="/about#contact"
                className="text-sm text-muted-foreground hover:text-green-600 transition-colors"
              >
                Contact
              </Link>
            </div>
            <div className="flex flex-col gap-3 text-center md:text-left">
              <h4 className="font-semibold text-sm">Legal</h4>
              <Link
                href="/privacy"
                className="text-sm text-muted-foreground hover:text-green-600 transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-muted-foreground hover:text-green-600 transition-colors"
              >
                Terms
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {year} ServiceFlow. All rights reserved.
          </p>
          <div className="flex gap-4">
            <a
              href="https://web.facebook.com/RosesRBlacc"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-green-600 transition-colors"
            >
              <Facebook className="size-5" />
            </a>
            <Link
              href="#"
              className="text-muted-foreground hover:text-green-600 transition-colors"
            >
              <Instagram className="size-5" />
            </Link>
            <Link
              href="#"
              className="text-muted-foreground hover:text-green-600 transition-colors"
            >
              <Twitter className="size-5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
