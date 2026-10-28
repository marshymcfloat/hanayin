"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "lenis/dist/lenis.css";
import styles from "@/components/landing/hanaylo/hanaylo.module.css";

export default function RedesignSmoothScroll() {
  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    let lenis: Lenis | undefined;

    const destroyLenis = () => {
      // Reset scrolling before teardown so a pending native-scroll timeout stays inert.
      lenis?.stop();
      lenis?.destroy();
      lenis = undefined;
    };

    const updateMotion = () => {
      destroyLenis();
      root.classList.toggle(styles.smoothScrollRoot, !motionPreference.matches);

      if (!motionPreference.matches) {
        lenis = new Lenis({
          autoRaf: true,
          anchors: true,
          lerp: 0.1,
          syncTouch: false,
          stopInertiaOnNavigate: true,
        });
        lenis.on("scroll", ScrollTrigger.update);
      }
    };

    updateMotion();
    motionPreference.addEventListener("change", updateMotion);

    return () => {
      motionPreference.removeEventListener("change", updateMotion);
      destroyLenis();
      root.classList.remove(styles.smoothScrollRoot);
    };
  }, []);

  return null;
}
