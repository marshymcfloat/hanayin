"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Check, Star } from "lucide-react";
import AnimatedFilterGroup from "@/components/bookings/design-study/AnimatedFilterGroup";
import styles from "@/components/landing/hanaylo/mobilo.module.css";

type MarketingPlan = { name: string; line: string; monthlyPrice: number; features: string[] };
const planArtwork = ["starter", "plus", "pro"];
const planLabels = ["Daily essentials", "Room to grow", "The complete toolkit"];

export default function BillingPeriodSelector({ plans }: { plans: MarketingPlan[] }) {
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const annual = period === "annual";
  const pesos = (value: number) => `₱${value.toLocaleString("en-PH")}`;

  return <><div className={styles.billingControls}>
    <AnimatedFilterGroup className={styles.billingToggle} label="Billing period">
      <button type="button" aria-pressed={period === "monthly"} onClick={() => setPeriod("monthly")}>Monthly</button>
      <button type="button" aria-pressed={period === "annual"} onClick={() => setPeriod("annual")}>Annually</button>
    </AnimatedFilterGroup>
    <p className={styles.billingNote} role="status">{annual ? "Get 2 months free with annual billing." : "Billed monthly. Choose annual billing for 2 months free."}</p>
  </div>
    <div className={styles.plans}>{plans.map((plan, index) => <article className={`${styles.planCard} ${index === 1 ? styles.featuredPlan : ""}`} key={plan.name} aria-label={`${plan.name} plan`}>
      {index === 1 && <span className={styles.planRecommendation}><Star size={12} aria-hidden="true" />Recommended</span>}
      <div className={styles.planIdentity}>
        <div className={styles.planHeading}><h3>{plan.name}</h3></div>
        <span className={styles.planLabelText}>{planLabels[index]}</span>
        <Image className={styles.planArtwork} src={`/hanaylo/pricing-${planArtwork[index]}-v1.png`} alt="" aria-hidden="true" width={1254} height={1254} sizes="200px" />
        <p>{plan.line}</p>
      </div>
      <div className={styles.planTop}>
        {annual && <div className={styles.planSavings}>
          <span className={styles.planSavingsBadge}>Save {pesos(plan.monthlyPrice * 2)}/year</span>
          <span className={styles.planComparison}><s>{pesos(plan.monthlyPrice * 12)}</s> with 12 monthly payments</span>
        </div>}
        <div className={styles.planPrice}><span className={styles.planCurrency}>₱</span><strong>{(plan.monthlyPrice * (annual ? 10 : 1)).toLocaleString("en-PH")}</strong><span className={styles.planPeriod}>{annual ? "/ year" : "/ month"}</span></div>
        <p className={styles.planBillingDetail}>{annual ? `${pesos(plan.monthlyPrice * 10)} billed annually` : `${pesos(plan.monthlyPrice)} billed monthly`}</p>
        <Link href="/apply" className={`${styles.button} ${index !== 1 ? styles.blackButton : ""}`}>Explore {plan.name}</Link>
      </div>
      <div className={styles.planFeatures}><h4>Included capabilities</h4><ul className={styles.checkList}>{plan.features.map(text => <li key={text}><Check size={16} aria-hidden="true" />{text}</li>)}</ul></div>
    </article>)}</div>
  </>;
}
