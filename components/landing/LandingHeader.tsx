"use client";

import AuthDialog from "@/components/auth/AuthDialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function LandingHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (isHome) {
      e.preventDefault();
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <header className="fixed top-0 w-full z-50 bg-white/60 dark:bg-black/60 backdrop-blur-xl border-b border-black/5 dark:border-white/10 transition-all duration-300">
      <div className="container mx-auto flex h-20 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3 group cursor-pointer">
          <Link
            href="/#hero"
            onClick={(e) => handleScroll(e, "hero")}
            className="flex items-center gap-3"
          >
            <div className="relative">
              <div className="absolute inset-0 md:size-10 size-8 rounded-xl blur-md group-hover:bg-green-200/30 transition-colors" />
              <Image
                src="/serviceFlow-logo.png"
                alt="ServiceFlow Logo"
                fill
                className="relative rounded-xl object-cover shadow-sm transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground/90 group-hover:text-green-700/60 transition-colors">
              ServiceFlow
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-8">
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/#features"
              onClick={(e) => handleScroll(e, "features")}
              className="text-sm font-medium text-muted-foreground hover:text-green-600 transition-colors"
            >
              Features
            </Link>
            <Link
              href="/#how-it-works"
              onClick={(e) => handleScroll(e, "how-it-works")}
              className="text-sm font-medium text-muted-foreground hover:text-green-600 transition-colors"
            >
              How It Works
            </Link>
            <Link
              href="/#pricing"
              onClick={(e) => handleScroll(e, "pricing")}
              className="text-sm font-medium text-muted-foreground hover:text-green-600 transition-colors"
            >
              Pricing
            </Link>
          </nav>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden md:block w-px h-6 bg-border/50"></div>
            <AuthDialog>
              <Button
                variant="ghost"
                className="h-10 rounded-full cursor-pointer   bg-white/75 px-4 text-foreground/80 backdrop-blur-sm hover:bg-slate-50 hover:text-foreground dark:border-white/15 dark:bg-black/30"
              >
                Sign in
              </Button>
            </AuthDialog>
            <Button
              asChild
              className="h-10 rounded-full px-4 sm:px-6 bg-zinc-900 hover:bg-zinc-800 cursor-pointer text-white shadow-lg shadow-zinc-900/20 transition-all hover:scale-105 active:scale-95"
            >
              <Link href="/apply">Apply Now</Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
