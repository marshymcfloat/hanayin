"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

if (typeof window !== "undefined") gsap.registerPlugin(useGSAP);

export default function HeroIntro({ children, className }: { children: ReactNode; className: string }) {
  const root = useRef<HTMLDivElement>(null);
  const skipEntrance = useRef(false);

  useGSAP(() => {
    const page = root.current;
    if (!page) return;
    const reveal = () => { page.dataset.introState = "complete"; };
    const first = page.querySelector<HTMLElement>("[data-intro-nav], [data-hero-copy]");
    const fallbackFinished = first?.getAnimations?.().some(animation =>
      "animationName" in animation && String(animation.animationName).includes("introFallback") && animation.playState === "finished",
    );
    if (!window.matchMedia("(scripting: enabled)").matches || window.scrollY > 80 || page.matches(":focus-within") || fallbackFinished) skipEntrance.current = true;
    if (skipEntrance.current) {
      reveal();
      return;
    }
    const media = gsap.matchMedia();
    let entered = false;

    media.add("(prefers-reduced-motion: no-preference)", () => {
      if (entered) { reveal(); return; }
      entered = true;
      const assets = "[data-hero-dryer], [data-hero-polish], [data-hero-serum], [data-hero-tools]";
      gsap.set("[data-intro-nav]", { opacity: 0, y: -8 });
      gsap.set("[data-hero-copy]", { opacity: 0, y: 16 });
      gsap.set(assets, { opacity: 0, y: 22, scale: 0.96 });
      gsap.set("[data-hero-dashboard]", { opacity: 0, y: 28 });
      const timeline = gsap.timeline({
        defaults: { duration: 0.7, ease: "power3.out", clearProps: "transform,opacity,visibility" },
        onComplete: reveal,
      });
      timeline
        .to("[data-intro-nav]", { opacity: 1, y: 0, stagger: 0.035, duration: 0.55 }, 0)
        .to("[data-hero-copy]", { opacity: 1, y: 0, stagger: 0.09 }, 0.12)
        .to(assets, { opacity: 1, y: 0, scale: 1, stagger: 0.055, duration: 0.85 }, 0.28)
        .to("[data-hero-dashboard]", { opacity: 1, y: 0, duration: 0.85 }, 0.36);
      page.dataset.introState = "running";

      const finish = () => { timeline.progress(1); };
      page.addEventListener("focusin", finish);
      return () => { page.removeEventListener("focusin", finish); reveal(); };
    }, root);

    if (!entered) { entered = true; reveal(); }
    return () => { media.revert(); reveal(); };
  }, { scope: root });

  return <div ref={root} className={className} id="top" data-intro-state="pending">{children}</div>;
}
