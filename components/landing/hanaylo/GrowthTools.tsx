import Image from "next/image";
import { ArrowUpRight, BarChart3, Megaphone, TrendingUp } from "lucide-react";
import styles from "@/components/landing/hanaylo/growth-tools.module.css";

export default function GrowthTools() {
  return <>
    <div className={styles.grid}>
      <article className={`${styles.card} ${styles.opportunity}`}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}><TrendingUp size={16} aria-hidden="true" />Spot the opportunity<span>PLUS & PRO</span></span>
          <h3>A quieter afternoon.<br />A reason to reach out.</h3>
          <p>Find quieter hours and review suggested offers. Turn a gap in your schedule into a promotion worth considering.</p>
        </div>
        <figure className={styles.signal}>
          <div className={styles.signalImage}><Image src="/hanaylo/product-growth-refined.png" alt="Illustrative growth signal suggesting a promotion between 2 PM and 5 PM, with a percentage-discount offer. Sample data." width={1536} height={1024} sizes="(max-width: 800px) 90vw, 700px" /></div>
          <figcaption>Illustrative growth signal · Sample data</figcaption>
        </figure>
      </article>
      <article className={`${styles.card} ${styles.promotion}`}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}><Megaphone size={16} aria-hidden="true" />Create the promotion<span>PRO</span></span>
          <h3>From an idea<br />to your next post.</h3>
          <p>Prepare AI-assisted captions and promotional images. Review your content, then publish through your configured integrations.</p>
        </div>
        <figure className={styles.creative}>
          <Image src="/hanaylo/growth-promotion-v1.png" alt="Example beauty-studio promotional creative featuring skincare, an orchid, and the headline ‘A little time for you.’" width={1536} height={1024} sizes="(max-width: 800px) 90vw, 560px" />
          <figcaption>Example creative · AI-generated illustration</figcaption>
        </figure>
      </article>
      <article className={styles.reporting}>
        <div className={styles.reportIntro}><BarChart3 size={24} aria-hidden="true" /><div><span className={styles.eyebrow}>See the bigger picture</span><h3>Keep your next move informed.</h3></div></div>
        <div className={styles.reportBody}><p>Review service revenue, expenses, and business performance to guide your next decision.</p><ul aria-label="Business reporting areas"><li>Service revenue</li><li>Expenses</li><li>Performance trends</li></ul></div>
      </article>
    </div>
    <div className={styles.footnote}><p>Growth insights are available on Plus and Pro. Social tools are available on Pro; publishing depends on configured integrations.</p><a href="#plans">Find your plan<ArrowUpRight size={16} aria-hidden="true" /></a></div>
  </>;
}
