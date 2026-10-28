"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

gsap.registerPlugin(useGSAP);

export default function TopServicesMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP((_context, contextSafe) => {
    const element = root.current;
    if (!element || !contextSafe || typeof window.matchMedia !== "function") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const bars = [...element.querySelectorAll<HTMLElement>("[data-top-service-bar]")];
    let observer: IntersectionObserver | undefined;
    let revealed = false;
    const reveal = contextSafe(() => {
      if (revealed) return;
      revealed = true;
      observer?.disconnect();
      if (preference.matches) return;
      gsap.fromTo(bars, { scaleX: 0 }, {
        scaleX: 1, duration: .65, stagger: .06, ease: "power3.out", clearProps: "transform",
      });
    });
    const onPreferenceChange = contextSafe(() => {
      if (!preference.matches) return;
      observer?.disconnect();
      gsap.killTweensOf(bars);
      gsap.set(bars, { clearProps: "transform" });
    });
    if (!preference.matches && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) reveal();
      }, { threshold: .15 });
      observer.observe(element);
    }
    preference.addEventListener("change", onPreferenceChange);
    return () => {
      observer?.disconnect();
      preference.removeEventListener("change", onPreferenceChange);
    };
  }, { scope: root });

  return <div ref={root}>{children}</div>;
}
