"use client";

import { useEffect } from "react";

/**
 * Track the mobile visual viewport so a fixed-position overlay can stay
 * vertically aligned to the visible area when the on-screen keyboard
 * pushes layout content off-screen.
 *
 * The browser's "visual viewport" is the part of the page actually
 * visible to the user — when a software keyboard opens on iOS / Android,
 * `window.visualViewport.height` shrinks and `offsetTop` may change.
 * The "layout viewport" (`window.innerHeight`) stays the same, which is
 * why a vanilla `position: fixed; top: 50%` dialog appears to slide
 * under the keyboard.
 *
 * Writes two CSS custom properties on `<html>`:
 *   --vvh  — current visual-viewport height in px (e.g. "640px")
 *   --vvy  — current visual-viewport offsetTop in px (e.g. "0px")
 *
 * Consumers can position with:
 *   top: calc(var(--vvy, 0px) + var(--vvh, 100dvh) / 2)
 * to keep the centerpoint anchored to the visible region rather than
 * the (now-offscreen) layout center.
 *
 * On desktop the values match `innerHeight` / 0 and the hook is a
 * no-op visually. The cost is one passive listener; safe to mount
 * unconditionally inside an open dialog/sheet.
 */
export function useVisualViewport(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;

    const html = document.documentElement;
    const vv = window.visualViewport;

    const update = () => {
      const h = vv?.height ?? window.innerHeight;
      const y = vv?.offsetTop ?? 0;
      html.style.setProperty("--vvh", `${h}px`);
      html.style.setProperty("--vvy", `${y}px`);
    };

    update();

    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    } else {
      window.addEventListener("resize", update);
    }

    return () => {
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      } else {
        window.removeEventListener("resize", update);
      }
      html.style.removeProperty("--vvh");
      html.style.removeProperty("--vvy");
    };
  }, [active]);
}
