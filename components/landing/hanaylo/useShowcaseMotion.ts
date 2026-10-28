"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

gsap.registerPlugin(useGSAP);

export function animateShowcaseRow(rail: HTMLElement, index: number, isPaused: () => boolean) {
  const track = rail.firstElementChild as HTMLElement;
  const group = track.firstElementChild as HTMLElement;
  let width = group.getBoundingClientRect().width;
  let x = index === 0 ? 0 : -width / 2;
  let hovered = false;
  let speed = 1;
  let momentum = 0;
  let dirty = false;
  let visible = false;
  let ticking = false;
  let pointer: { id: number; x: number; time: number } | null = null;

  const draw = () => {
    if (!width) return;
    x = ((x % width) - width) % width;
    track.style.transform = `translateX(${x}px)`;
    dirty = false;
  };
  const resize = new ResizeObserver(() => {
    const nextWidth = group.getBoundingClientRect().width;
    if (width && nextWidth) x *= nextWidth / width;
    width = nextWidth;
    draw();
  });
  resize.observe(group);

  const tick = (_time: number, delta: number) => {
    const paused = isPaused();
    const dt = Math.min(delta / 1000, 0.05);
    speed += ((hovered ? 0.2 : 1) - speed) * (1 - Math.exp(-8 * dt));
    if (!pointer && !paused) {
      x += ((index === 0 ? -width / 65 : width / 75) * speed + momentum) * dt;
      momentum *= Math.exp(-4.5 * dt);
      dirty = true;
    } else if (paused) momentum = 0;
    if (dirty) draw();
  };
  const syncActivity = () => {
    const active = visible && !document.hidden;
    if (active === ticking) return;
    ticking = active;
    if (active) {
      track.style.willChange = "transform";
      gsap.ticker.add(tick);
    } else {
      gsap.ticker.remove(tick);
      track.style.removeProperty("will-change");
      momentum = 0;
    }
  };
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncActivity();
  });
  visibility.observe(rail);
  document.addEventListener("visibilitychange", syncActivity);
  const enter = (event: PointerEvent) => { if (event.pointerType !== "touch") hovered = true; };
  const leave = () => { hovered = false; };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || pointer) return;
    pointer = { id: event.pointerId, x: event.clientX, time: event.timeStamp };
    momentum = 0;
    rail.setPointerCapture(event.pointerId);
    rail.dataset.dragging = "true";
  };
  const move = (event: PointerEvent) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x;
    const dt = Math.max(event.timeStamp - pointer.time, 8) / 1000;
    x += dx;
    momentum = Math.max(-1800, Math.min(1800, dx / dt));
    pointer.x = event.clientX;
    pointer.time = event.timeStamp;
    dirty = true;
  };
  const end = (event: PointerEvent) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (event.type !== "pointerup" || event.timeStamp - pointer.time > 100 || isPaused()) momentum = 0;
    pointer = null;
    delete rail.dataset.dragging;
    if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    momentum = 0;
    x += event.key === "ArrowLeft" ? 180 : -180;
    draw();
  };
  rail.addEventListener("pointerenter", enter);
  rail.addEventListener("pointerleave", leave);
  rail.addEventListener("pointerdown", down);
  rail.addEventListener("pointermove", move);
  rail.addEventListener("pointerup", end);
  rail.addEventListener("pointercancel", end);
  rail.addEventListener("lostpointercapture", end);
  rail.addEventListener("keydown", keydown);
  draw();

  return () => {
    if (ticking) gsap.ticker.remove(tick);
    visibility.disconnect();
    document.removeEventListener("visibilitychange", syncActivity);
    resize.disconnect();
    rail.removeEventListener("pointerenter", enter);
    rail.removeEventListener("pointerleave", leave);
    rail.removeEventListener("pointerdown", down);
    rail.removeEventListener("pointermove", move);
    rail.removeEventListener("pointerup", end);
    rail.removeEventListener("pointercancel", end);
    rail.removeEventListener("lostpointercapture", end);
    rail.removeEventListener("keydown", keydown);
    if (pointer && rail.hasPointerCapture(pointer.id)) rail.releasePointerCapture(pointer.id);
    delete rail.dataset.dragging;
    track.style.removeProperty("transform");
    track.style.removeProperty("will-change");
  };
}

export default function useShowcaseMotion(root: RefObject<HTMLDivElement | null>, paused: boolean) {
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const cleanups = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-service-row]") ?? [])
        .map((rail, index) => animateShowcaseRow(rail, index, () => pausedRef.current));
      return () => cleanups.forEach(cleanup => cleanup());
    });
    return () => media.revert();
  }, { scope: root });
}
