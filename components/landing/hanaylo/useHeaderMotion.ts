"use client";

import type { RefObject } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(useGSAP);

export default function useHeaderMotion(
  header: RefObject<HTMLElement | null>,
  surface: RefObject<HTMLSpanElement | null>,
  menu: RefObject<HTMLElement | null>,
  open: boolean,
  expandAtTop = false,
) {
  useGSAP(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (!surface.current) return;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reveal = gsap.fromTo(surface.current,
      { autoAlpha: 0, scaleX: 0.985, scaleY: 0.94 },
      { autoAlpha: 1, scaleX: 1, scaleY: 1, ease: "none", paused: true },
    );
    const update = (trigger: ScrollTrigger) => {
      reveal.progress(motionPreference.matches ? (window.scrollY >= 48 ? 1 : 0) : trigger.progress);
    };
    const trigger = ScrollTrigger.create({
      start: 24,
      end: 140,
      onUpdate: update,
      onRefresh: update,
    });
    const updateMotion = () => update(trigger);
    motionPreference.addEventListener("change", updateMotion);
    updateMotion();

    return () => motionPreference.removeEventListener("change", updateMotion);
  }, { scope: header });

  useGSAP(() => {
    const element = header.current;
    if (!expandAtTop || !element) return;
    const media = gsap.matchMedia();
    media.add({ desktop: "(min-width: 801px)", reduced: "(prefers-reduced-motion: reduce)" }, (context) => {
      if (!context.conditions?.desktop) return;
      const reduced = context.conditions.reduced;
      const widthAt = (progress: number) => {
        const expanded = Math.min(1320, window.innerWidth - 64);
        const compact = Math.min(1120, window.innerWidth - 96);
        return expanded + (compact - expanded) * progress;
      };
      const widthTo = gsap.quickTo(element, "width", { duration: 0.65, ease: "power3.out" });
      const sync = (trigger: ScrollTrigger) => {
        widthTo.tween.pause();
        gsap.set(element, { width: widthAt(reduced ? Number(window.scrollY >= 48) : trigger.progress) });
      };
      ScrollTrigger.create({
        start: 24,
        end: 160,
        onRefresh: sync,
        onUpdate: (trigger) => {
          if (reduced) sync(trigger);
          else widthTo(widthAt(trigger.progress));
        },
      });
      return () => { element.style.removeProperty("width"); };
    });
    return () => media.revert();
  }, { scope: header, dependencies: [expandAtTop], revertOnUpdate: true });

  useGSAP(() => {
    if (!open || !menu.current) return;
    const panel = menu.current;
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.timeline({ defaults: { ease: "power3.out" } })
        .fromTo(panel, { opacity: 0, y: -8, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.24 })
        .fromTo(panel.querySelectorAll("a"), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.035 }, 0.04);
    });

    return () => media.revert();
  }, { scope: header, dependencies: [open], revertOnUpdate: true });
}
