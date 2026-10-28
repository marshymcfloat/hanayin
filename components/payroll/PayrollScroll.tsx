"use client";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./payroll.module.css";

export function PayrollScroll({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current; if (!element) return;
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      element.dataset.scrolling = "true"; clearTimeout(timer);
      timer = setTimeout(() => { delete element.dataset.scrolling; }, 800);
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearTimeout(timer); element.removeEventListener("scroll", onScroll); };
  }, []);
  return <div ref={ref} className={styles.scroll + " " + className} tabIndex={0} role="region" aria-label={label}>{children}</div>;
}
