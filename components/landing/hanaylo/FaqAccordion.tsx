"use client";

import { useId, useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { Plus } from "lucide-react";
import styles from "@/components/landing/hanaylo/faq.module.css";

gsap.registerPlugin(useGSAP);

type Question = { question: string; answer: string };

function FaqItem({ item, index }: { item: Question; index: number }) {
  const root = useRef<HTMLDetailsElement>(null);
  const id = useId();

  useGSAP((_context, contextSafe) => {
    const details = root.current;
    if (!details || !contextSafe) return;
    const summary = details.querySelector("summary")!;
    const panel = details.querySelector<HTMLElement>("[data-faq-panel]")!;
    const content = panel.firstElementChild as HTMLElement;
    const icon = details.querySelector<SVGElement>("[data-faq-icon]")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const initial = details.open;
    let expanded = initial;
    let animation: gsap.core.Tween | undefined;
    let targetHeight = 0;
    gsap.set(icon, { rotation: initial ? 45 : 0 });

    const settle = () => {
      animation = undefined;
      details.open = expanded;
      panel.style.removeProperty("height");
    };
    const animate = contextSafe(() => {
      const currentHeight = details.open ? panel.getBoundingClientRect().height : 0;
      animation?.kill();
      summary.setAttribute("aria-expanded", String(expanded));
      details.dataset.expanded = String(expanded);
      panel.inert = !expanded;
      panel.setAttribute("aria-hidden", String(!expanded));
      if (reduced.matches) {
        gsap.set(icon, { rotation: expanded ? 45 : 0, overwrite: true });
        settle();
        return;
      }
      details.open = true;
      targetHeight = expanded ? content.getBoundingClientRect().height : 0;
      gsap.set(panel, { height: currentHeight });
      animation = gsap.to(panel, {
        height: targetHeight,
        duration: 0.38,
        ease: "power3.inOut",
        overwrite: true,
        onComplete: settle,
      });
      gsap.to(icon, { rotation: expanded ? 45 : 0, duration: 0.25, ease: "power2.out", overwrite: true });
    });
    const click = (event: MouseEvent) => {
      event.preventDefault();
      expanded = !expanded;
      animate();
    };
    const resize = new ResizeObserver(([entry]) => {
      if (!expanded || !animation?.isActive() || !entry) return;
      const height = entry.borderBoxSize[0]?.blockSize ?? content.getBoundingClientRect().height;
      // Opening a native disclosure also notifies the observer; only retarget a real resize.
      if (Math.abs(height - targetHeight) > 0.5) animate();
    });
    resize.observe(content);
    const preferenceChange = () => { if (reduced.matches) animate(); };
    summary.addEventListener("click", click);
    reduced.addEventListener("change", preferenceChange);

    return () => {
      animation?.kill();
      resize.disconnect();
      summary.removeEventListener("click", click);
      reduced.removeEventListener("change", preferenceChange);
      details.open = initial;
      delete details.dataset.expanded;
      summary.removeAttribute("aria-expanded");
      panel.removeAttribute("aria-hidden");
      panel.inert = false;
      panel.style.removeProperty("height");
    };
  }, { scope: root });

  return <details ref={root} className={styles.item} open={index === 0}>
    <summary aria-controls={`${id}-answer`}>
      <span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <span className={styles.question}>{item.question}</span>
      <span className={styles.indicator} aria-hidden="true"><Plus data-faq-icon size={17} /></span>
    </summary>
    <div id={`${id}-answer`} className={styles.panel} data-faq-panel>
      <div className={styles.answer}><p>{item.answer}</p></div>
    </div>
  </details>;
}

export default function FaqAccordion({ questions }: { questions: Question[] }) {
  return <div className={styles.list}>{questions.map((item, index) => <FaqItem key={item.question} item={item} index={index} />)}</div>;
}
