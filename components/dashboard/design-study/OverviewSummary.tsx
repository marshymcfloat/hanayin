"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ArrowUpRight, CalendarDays, CreditCard, UserRound, Users } from "lucide-react";
import styles from "@/components/dashboard/design-study/overview-summary.module.css";
import type { OwnerRedesignAnalytics } from "@/features/dashboard/types/owner-redesign";
import { AnimatedValue } from "@/components/bookings/design-study/SelectionMotion";

gsap.registerPlugin(useGSAP);

const currency = (value: number) => `₱${(Math.round(value * 100) / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

export default function OverviewSummary({ data }: { data: OwnerRedesignAnalytics }) {
  const { summary } = data;
  const team = data.periods.Month.staff.slice(0, 3);
  const change = summary.previousRevenue ? (summary.revenue - summary.previousRevenue) / summary.previousRevenue * 100 : null;
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const panels = root.current?.querySelectorAll("[data-summary-reveal]");
      if (panels?.length) gsap.fromTo(panels, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: .55, stagger: .055, ease: "power3.out", clearProps: "transform,opacity" });
    });
    return () => media.revert();
  }, { scope: root });

  return <div ref={root} className={styles.summary}>
    <div className={styles.heading} data-summary-reveal>
      <div><p className={styles.eyebrow}>YOUR BUSINESS, AT A GLANCE</p><h1>A good day starts here.</h1><p>A clear view of your bookings, team, and business.</p></div>
      <span className={styles.date}><CalendarDays size={15} aria-hidden="true" />{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }).format(new Date(data.generatedAt))}</span>
    </div>
    <section className={styles.metrics} aria-label="Performance overview">
      <div data-summary-reveal><article className={`${styles.metric} ${styles.revenue}`} aria-label="Total revenue">
        <div className={styles.label}><h2>Total revenue</h2><span className={styles.period}>This month</span></div>
        <div className={styles.revenueValue}><strong><AnimatedValue value={summary.revenue} count formatNumber={currency} /></strong>{change !== null && <span className={styles.growth}>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</span>}</div>
        <p className={styles.footnote}>vs. {currency(summary.previousRevenue)} prior month to date</p>
      </article></div>
      <div data-summary-reveal><article className={styles.metric} aria-label="Bookings summary">
        <div className={styles.label}><span className={styles.icon}><CalendarDays size={17} aria-hidden="true" /></span><h2>Bookings</h2></div>
        <strong className={styles.value}><AnimatedValue value={summary.bookings} count /></strong>
        <p className={styles.footnote}>Created this month</p>
        <p className={styles.comparisonNote}>{summary.previousBookings} prior month to date</p>
      </article></div>
      <div data-summary-reveal><article className={`${styles.metric} ${styles.customers}`} aria-label="Customers summary">
        <div className={styles.label}><span className={styles.icon}><Users size={17} aria-hidden="true" /></span><h2>Customers served</h2></div>
        <strong className={styles.value}><AnimatedValue value={summary.customers} count /></strong>
        <p className={styles.footnote}>Known customers this month</p><p className={styles.comparisonNote}>{summary.visits} completed visits</p>
      </article></div>
      <div data-summary-reveal><article className={styles.metric} aria-label="Average spend">
        <div className={styles.label}><span className={styles.icon}><CreditCard size={17} aria-hidden="true" /></span><h2>Avg. spend</h2></div>
        <strong className={styles.value}><AnimatedValue value={summary.average} count formatNumber={currency} /></strong><p className={styles.footnote}>Per completed visit</p>
      </article></div>
    </section>
    <div data-summary-reveal>
      <section className={styles.team} aria-label="Recent contributors">
        <div className={styles.teamHeading}><h2>Recent contributors</h2><span>This month’s completed work</span></div>
        <ul>{team.map(member => <li key={member.id}><span className={styles.avatar} aria-hidden="true"><UserRound size={17} /></span><div><strong>{member.name}</strong><span>{member.count} completed visits</span></div></li>)}</ul>
        {!team.length && <p className={styles.footnote}>No completed work yet.</p>}
        <a href="#team">Team overview <ArrowUpRight size={15} aria-hidden="true" /></a>
      </section>
    </div>
  </div>;
}
