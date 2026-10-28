"use client";

import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import styles from "@/components/bookings/design-study/booking-design-experiment.module.css";

gsap.registerPlugin(useGSAP);

export default function AnimatedFilterGroup({ children, className, label }: {
  children: ReactNode; className: string; label: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  useGSAP((_, contextSafe) => {
    const group = root.current;
    const marker = indicator.current;
    if (!group || !marker || !contextSafe) return;
    let tween: gsap.core.Tween | undefined;
    let initialized = false;
    const move = contextSafe((animate = true) => {
      const active = group.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (!active || !active.offsetWidth) return;
      tween?.kill();
      const reduce = typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;
      tween = gsap.to(marker, {
        x: active.offsetLeft, y: active.offsetTop,
        width: active.offsetWidth, height: active.offsetHeight,
        duration: initialized && animate && !reduce ? .34 : 0,
        ease: "power3.out", overwrite: true,
      });
      group.dataset.motionReady = "true";
      initialized = true;
    });
    move(false);
    const changes = new MutationObserver(() => move());
    changes.observe(group, { subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(() => move(false)) : undefined;
    resize?.observe(group);
    group.querySelectorAll("button").forEach((button) => resize?.observe(button));
    return () => { changes.disconnect(); resize?.disconnect(); tween?.kill(); delete group.dataset.motionReady; };
  }, { scope: root });
  return <div ref={root} className={`${className} ${styles.animatedFilters}`} role="group" aria-label={label}>
    <span ref={indicator} className={styles.filterHighlight} aria-hidden="true" />
    {children}
  </div>;
}
