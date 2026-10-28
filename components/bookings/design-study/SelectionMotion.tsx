"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { formatCurrency } from "@/lib/utils";
import styles from "@/components/bookings/design-study/booking-design-experiment.module.css";

gsap.registerPlugin(useGSAP);

const reducedMotion = () => typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const formatValue = (amount: number, currency: boolean) => currency ? formatCurrency(amount) : String(Math.round(amount));

export function AnimatedValue({ value, currency = false, count = currency, formatNumber }: {
  value: number; currency?: boolean; count?: boolean; formatNumber?: (value: number) => string;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const display = useRef<HTMLSpanElement>(null);
  const current = useRef({ value });
  const previous = useRef(value);
  useLayoutEffect(() => {
    const target = display.current;
    if (!target) return;
    let active = true;
    const format = (amount: number) => formatNumber ? formatNumber(amount) : formatValue(amount, currency);
    // The visual value is painted by data-display; discard stale text from hot reloads.
    target.replaceChildren();
    const context = gsap.context(() => {
      if (reducedMotion() || previous.current === value) {
        current.current.value = value;
        target.dataset.display = format(value);
      } else if (count) {
        const counter = { value: current.current.value };
        gsap.to(counter, {
          value, duration: .42, ease: "power3.out",
          onUpdate: () => {
            if (!active) return;
            current.current.value = counter.value;
            target.dataset.display = format(counter.value);
          },
        });
      } else {
        current.current.value = value;
        target.dataset.display = format(value);
        gsap.fromTo(target, { y: value > previous.current ? 6 : -6, opacity: .3 },
          { y: 0, opacity: 1, duration: .28, ease: "power3.out", clearProps: "transform,opacity" });
      }
    }, root);
    previous.current = value;
    return () => {
      // Reverting a tween can fire onUpdate with its old start value.
      active = false;
      context.revert();
    };
  }, [value, currency, count, formatNumber]);

  return <span ref={root} className={styles.animatedValue}>
    <span className={styles.screenReaderOnly}>{formatNumber ? formatNumber(value) : formatValue(value, currency)}</span>
    <span ref={display} aria-hidden="true" />
  </span>;
}

type RowSnapshot = { top: number; clone: HTMLElement; left: number; width: number; height: number };

export function useSelectionMotion(root: RefObject<HTMLDivElement | null>, revision: object | string, target = "selection") {
  const before = useRef(new Map<string, RowSnapshot>());
  const ghosts = useRef<HTMLElement[]>([]);
  const { contextSafe } = useGSAP(() => () => {
    ghosts.current.forEach((ghost) => ghost.remove());
  }, { scope: root });

  const capture = () => contextSafe(() => {
    before.current.clear();
    if (reducedMotion()) return;
    const rows = root.current?.querySelectorAll<HTMLElement>(`[data-${target}-row]`);
    rows?.forEach((row) => {
      const bounds = row.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      before.current.set(row.getAttribute(`data-${target}-row`)!, {
        top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height,
        clone: row.cloneNode(true) as HTMLElement,
      });
    });
    rows?.forEach((row) => {
      gsap.killTweensOf(row);
      gsap.set(row, { clearProps: "transform,opacity" });
    });
  })();

  useGSAP(() => {
    const area = root.current?.querySelector<HTMLElement>(`[data-${target}-area]`);
    if (!area || reducedMotion()) { before.current.clear(); return; }
    const rows = [...area.querySelectorAll<HTMLElement>(`[data-${target}-row]`)];
    const measured = rows.map((row) => ({ row, bounds: row.getBoundingClientRect() }));
    const areaBounds = area.getBoundingClientRect();
    const remaining = new Set(rows.map((row) => row.getAttribute(`data-${target}-row`)));
    measured.forEach(({ row, bounds }, index) => {
      if (!bounds.width) return;
      const old = before.current.get(row.getAttribute(`data-${target}-row`)!);
      gsap.fromTo(row, { x: old ? old.left - bounds.left : 0, y: old ? old.top - bounds.top : 12, opacity: old ? 1 : 0 },
        { x: 0, y: 0, opacity: 1, duration: .38, delay: target === "catalog" && !old ? Math.min(index * .025, .1) : 0, ease: "power3.out", clearProps: "transform,opacity" });
    });
    before.current.forEach((old, key) => {
      if (remaining.has(key)) return;
      const ghost = old.clone;
      ghost.removeAttribute(`data-${target}-row`);
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      Object.assign(ghost.style, { position: "absolute", margin: "0", pointerEvents: "none",
        top: `${old.top - areaBounds.top + area.scrollTop}px`, left: `${old.left - areaBounds.left}px`,
        width: `${old.width}px`, height: `${old.height}px`, zIndex: "2", listStyle: "none", transform: "none" });
      area.appendChild(ghost);
      ghosts.current.push(ghost);
      gsap.to(ghost, { opacity: 0, x: 12, scale: .98, duration: .2, ease: "power2.out", onComplete: () => {
        ghost.remove();
        ghosts.current = ghosts.current.filter((node) => node !== ghost);
      } });
    });
    before.current.clear();
    return () => {
      ghosts.current.forEach((ghost) => ghost.remove());
      ghosts.current = [];
    };
  }, { scope: root, dependencies: [revision], revertOnUpdate: true });

  return capture;
}
