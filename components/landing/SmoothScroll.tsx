"use client";

import { useEffect } from "react";
import Lenis from "lenis";

declare global {
  interface Window {
    /** Active Lenis instance, exposed so header anchor links can route
     *  smooth-scrolls through it instead of fighting the native scroll. */
    __lenis?: Lenis;
  }
}

/**
 * Mounts Lenis smooth-scroll for the lifetime of the component.
 * Scoped to the public home page (not the dashboard) so the app stays
 * snappy where instant scroll matters.
 *
 * Honors `prefers-reduced-motion`: Lenis is disabled entirely if the
 * user has reduced-motion enabled in their OS.
 *
 * Plays nicely with `motion/react`'s `useScroll` (the parallax badge in
 * HeroSection) and the scroll listener in LandingHeader because Lenis
 * drives the native window scroll under the hood.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) return;

    const lenis = new Lenis({
      // Tuned for a calm, premium feel — quick enough to feel responsive,
      // slow enough to feel polished. Mirrors what Vercel uses.
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      // `smoothTouch: false` is the default — touch devices keep their
      // native momentum scroll which feels better than emulated.
      smoothWheel: true,
      wheelMultiplier: 1,
    });

    // Expose so other components can call `lenis.scrollTo(...)` for
    // anchor-link navigation that stays in sync with the smooth-scroll
    // engine. Native `scrollIntoView` would otherwise race Lenis.
    window.__lenis = lenis;

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      delete window.__lenis;
      lenis.destroy();
    };
  }, []);

  return null;
}
