"use client";

import { useEffect } from "react";

/**
 * Lock page scroll while a modal / drawer / lightbox / sheet is open.
 *
 * Uses the `position: fixed` body-lock pattern (same approach used by
 * `body-scroll-lock`, Radix in some flows, and most premium modal libs):
 *
 *  1. Capture `window.scrollY` before locking
 *  2. Set body { position: fixed; top: -scrollY; overflow: hidden } so
 *     the body is pinned at its current visual position. Nothing the
 *     browser does (autofocus, view transitions, route navigation,
 *     wheel events that escape Lenis) can move the page beneath the
 *     overlay anymore.
 *  3. Compensate the scrollbar width so there's no horizontal shift.
 *  4. Call `lenis.stop()` so the smooth-scroll engine is paused.
 *
 * On unmount: restore body styles and `scrollTo(0, savedY)` instantly.
 *
 * Pair this with `data-lenis-prevent` on the overlay's scrollable inner
 * container so native scroll inside the overlay still works while the
 * page beneath is fully locked.
 */
export function useLockScroll(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;

    const body = document.body;
    const html = document.documentElement;

    const savedScrollY = window.scrollY;
    const savedScrollX = window.scrollX;

    const savedStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
      htmlScrollBehavior: html.style.scrollBehavior,
    };

    // Disable any smooth-scroll during the lock/unlock transitions so
    // the saved-position restore on unmount is instant, not animated.
    html.style.scrollBehavior = "auto";

    // Compensate scrollbar width on the body so removing the scrollbar
    // doesn't visually shift the page sideways.
    const scrollbarWidth =
      window.innerWidth - html.clientWidth;
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // Pin body at current scroll position. position:fixed + negative
    // top yields a perfectly stationary page beneath the overlay.
    body.style.position = "fixed";
    body.style.top = `-${savedScrollY}px`;
    body.style.left = `-${savedScrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    const lenis = window.__lenis;
    lenis?.stop();

    return () => {
      body.style.position = savedStyles.position;
      body.style.top = savedStyles.top;
      body.style.left = savedStyles.left;
      body.style.right = savedStyles.right;
      body.style.width = savedStyles.width;
      body.style.overflow = savedStyles.overflow;
      body.style.paddingRight = savedStyles.paddingRight;

      // Restore exactly where the user was. Instant — no animated jump.
      window.scrollTo(savedScrollX, savedScrollY);

      html.style.scrollBehavior = savedStyles.htmlScrollBehavior;
      lenis?.start();
    };
  }, [active]);
}
