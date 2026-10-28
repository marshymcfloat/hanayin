"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Pause, Play } from "lucide-react";
import styles from "@/components/landing/hanaylo/service-showcase.module.css";
import useShowcaseMotion from "@/components/landing/hanaylo/useShowcaseMotion";

const rows = [
  [
    { title: "Hair & styling", detail: "The right specialist for every appointment.", image: "hero-hair-dryer-v1.png", tone: "lilac" },
    { title: "Nail care", detail: "Every little detail. Every booked visit.", image: "hero-nail-polish-v1.png", tone: "rose" },
    { title: "Spa & wellness", detail: "Time for each treatment, space for each guest.", image: "showcase-spa-v1.png", tone: "cream" },
    { title: "Beauty services", detail: "Your services, connected to your team.", image: "showcase-beauty-v1.png", tone: "plum" },
  ],
  [
    { title: "A day in order", detail: "Appointments and walk-ins, kept together.", image: "foundation-bookings-v1.png", tone: "cream" },
    { title: "A connected team", detail: "Specialties, assignments, and attendance.", image: "foundation-team-v1.png", tone: "plum" },
    { title: "Work into earnings", detail: "Daily pay and eligible service commissions.", image: "foundation-earnings-v1.png", tone: "lilac" },
    { title: "Room for the next", detail: "Open slots today. Opportunities for tomorrow.", image: "pricing-plus-v1.png", tone: "rose" },
  ],
];

export default function ServiceShowcase() {
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useShowcaseMotion(root, paused);

  return <div ref={root} className={styles.showcase} data-paused={paused}>
    <div className={styles.toolbar}>
      <p className={styles.toolbarLabel}>Your services <ArrowRight size={16} aria-hidden="true" /> One connected workday</p>
      <div className={styles.controls}>
        <span className={styles.swipeHint}>Drag or swipe to explore</span>
        <button type="button" className={styles.pause} aria-pressed={paused} aria-controls="service-showcase-rows" aria-label="Pause showcase animation" onClick={() => setPaused(value => !value)}>
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          <span>{paused ? "Resume motion" : "Pause motion"}</span>
        </button>
      </div>
    </div>
    <div id="service-showcase-rows" className={styles.rails}>
      {rows.map((items, row) => <div className={styles.rail} data-service-row key={row} tabIndex={0} role="group" aria-label={`${row === 0 ? "Services" : "Daily work"} showcase. Drag, swipe, or use left and right arrow keys to explore.`}>
        <div className={styles.track}>
          {[0, 1].map(copy => <ul className={styles.group} key={copy} aria-label={copy === 0 ? (row === 0 ? "Services your team delivers" : "How HANAYIN supports your work") : undefined} aria-hidden={copy === 1 ? true : undefined}>
            {items.map((item, index) => <li className={`${styles.card} ${styles[item.tone]}`} key={item.title}>
              <span className={styles.eyebrow}>{row === 0 ? "The services" : "The everyday"}<span aria-hidden="true">0{index + 1}</span></span>
              <div className={styles.copy}><h3>{item.title}</h3><p>{item.detail}</p></div>
              <Image src={`/hanaylo/${item.image}`} alt="" aria-hidden="true" draggable={false} width={180} height={180} sizes="180px" className={styles.art} />
            </li>)}
          </ul>)}
        </div>
      </div>)}
    </div>
  </div>;
}
