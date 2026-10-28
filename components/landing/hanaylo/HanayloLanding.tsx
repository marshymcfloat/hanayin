import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, Layers3, Sparkles, Users, Wallet } from "lucide-react";
import BrandMark from "@/components/landing/hanaylo/BrandMark";
import HanayloHeader from "@/components/landing/hanaylo/HanayloHeader";
import RedesignSmoothScroll from "@/components/landing/hanaylo/RedesignSmoothScroll";
import { DashboardPreview, EarningsPreview, GrowthPreview, SchedulePreview, ServicePreview, TeamPreview } from "@/components/landing/hanaylo/ProductPreviews";
import styles from "@/components/landing/hanaylo/hanaylo.module.css";

const questions = [
  { question: "Is HANAYIN a good fit for my business?", answer: "HANAYIN fits businesses where customers book or walk in, a team member delivers a service, and the owner needs to manage the work and staff earnings. Salons, barbershops, spas, and service studios share this way of working." },
  { question: "Does my team have to work on commission?", answer: "No. You can use attendance-based daily pay, an employee-level commission percentage, or both. Tiered rates and splitting one service’s commission across multiple providers are not part of the current commission model." },
  { question: "Does HANAYIN transfer my team’s pay?", answer: "HANAYIN calculates earnings and helps you prepare and record payslips. Commission eligibility requires a completed service and a fully paid booking. Bank transfers, statutory deductions, and tax filing are handled separately." },
  { question: "How do I get started?", answer: "Submit your business details through Get started. Your setup is reviewed before access is provisioned. Growth and social tools depend on your plan and configured integrations. Application and sign-in pages currently use the ServiceFlow name while HANAYIN is being introduced." },
];

export default function HanayloLanding({ fontClassName }: { fontClassName: string }) {
  return (
    <div className={`${styles.page} ${fontClassName}`} id="top">
      <RedesignSmoothScroll />
      <a href="#main" className={styles.skipLink}>Skip to content</a>
      <HanayloHeader />
      <main id="main">
        <section className={styles.heroShell} aria-labelledby="hero-heading">
          <div className={styles.heroDecoration} aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className={`${styles.wrap} ${styles.hero}`}>
            <span className={styles.badge}><Sparkles size={13} aria-hidden="true" /> A little order. A lot of possibility.</span>
            <h1 id="hero-heading">Your whole business.<br /><span>Working together.</span></h1>
            <p className={styles.heroDescription}>Bookings, your team, and the pay they earn.<br />Finally connected in one place.</p>
            <div className={styles.heroActions}><Link href="/apply" className={styles.button}>Get started <ArrowRight size={16} aria-hidden="true" /></Link><a href="#product" className={styles.secondaryButton}>Explore HANAYIN <ArrowUpRight size={16} aria-hidden="true" /></a></div>
            <p className={styles.heroNote}>Built for businesses where people deliver the service.</p>
          </div>
          <div className={styles.heroProduct} id="product">
            <div className={styles.productGlow} aria-hidden="true" />
            <DashboardPreview />
            <div className={styles.productCaption}><span><span className={styles.smallDot} />Your business, at a glance.</span><span>Product illustration · Sample data</span></div>
          </div>
        </section>

        <section className={`${styles.wrap} ${styles.audienceStrip}`} aria-label="Businesses HANAYIN supports"><p>Different services. The same way of working.</p><div><span>Salons</span><span>Barbershops</span><span>Spas</span><span>Service studios</span></div></section>

        <section className={`${styles.wrap} ${styles.planningSection}`} aria-labelledby="planning-heading">
          <div className={styles.sectionIntro}><span className={styles.sectionIcon}><CalendarDays size={20} aria-hidden="true" /></span><div><h2 id="planning-heading">A good day starts<br />with a clear plan.</h2><p>Give every booking a place. Give every service a person.<br className={styles.desktopBreak} /> Keep the whole team moving together.</p></div></div>
          <div className={styles.planningGrid}>
            <article className={`${styles.featureCard} ${styles.scheduleCard}`}><div className={styles.featureCopy}><span className={styles.featureEyebrow}>THE DAY, AT A GLANCE</span><h3>Keep the next visit in view.</h3><p>See today’s bookings, services, and appointment status.</p></div><SchedulePreview /></article>
            <article className={`${styles.featureCard} ${styles.teamCard}`}><div className={styles.featureCopy}><span className={styles.featureEyebrow}>YOUR PEOPLE, CONNECTED</span><h3>Everyone has their place.</h3><p>Roles, service specialties, and regular days off. Easy to find.</p></div><TeamPreview /></article>
          </div>
        </section>

        <section className={styles.peopleSection} id="for-teams" aria-labelledby="people-heading">
          <div className={styles.centerIntro}><span className={styles.badge}><Users size={13} aria-hidden="true" /> Made for service teams</span><h2 id="people-heading">Good people.<br /><span>Great work, together.</span></h2><p>You run the business. Your team delivers the service.<br />HANAYIN connects the details in between.</p></div>
          <div className={styles.photoRail}>
            <div className={`${styles.photoCard} ${styles.photoCardOuter}`}><Image src="/hanaylo/studio-moment.png" alt="" fill sizes="260px" className={styles.railImage} /><span>Every appointment</span></div>
            <div className={`${styles.photoCard} ${styles.photoCardInner}`}><div className={styles.railGraphic}><CalendarDays size={30} aria-hidden="true" /><strong>Your day,<br />in sync.</strong><span className={styles.railGraphicTag}>One connected workday</span></div></div>
            <div className={`${styles.photoCard} ${styles.photoCardCenter}`}><Image src="/hanaylo/team-moment.png" alt="Illustrative service team reviewing the day together" fill sizes="600px" className={styles.railImage} /><span>Every person</span></div>
            <div className={`${styles.photoCard} ${styles.photoCardInner}`}><div className={`${styles.railGraphic} ${styles.railGraphicBlue}`}><Wallet size={30} aria-hidden="true" /><strong>Good work.<br />Clear earnings.</strong><span className={styles.railGraphicTag}>The details add up</span></div></div>
            <div className={`${styles.photoCard} ${styles.photoCardOuter}`}><Image src="/hanaylo/studio-moment.png" alt="" fill sizes="260px" className={styles.railImage} /><span>Every service</span></div>
          </div>
          <p className={styles.imageryNote}>Illustrative brand imagery generated with AI.</p>
        </section>

        <section className={styles.darkSection} aria-labelledby="connected-heading">
          <div className={styles.wrap}>
            <div className={styles.centerIntro}><span className={styles.darkBadge}><Layers3 size={13} aria-hidden="true" /> THE WORK AND WHAT IT EARNS</span><h2 id="connected-heading">From the first booking<br /><span>to the final payslip.</span></h2><p>See what happened, who did the work,<br />and how the earnings come together.</p></div>
            <div className={styles.darkRows}>
              <article className={styles.darkRow}><div className={styles.darkCopy}><span className={styles.featureEyebrow}>01 / FOLLOW THE SERVICE</span><h3>Know where<br />every visit stands.</h3><p>Keep assigned staff, service status, customer records, and payments connected. One visit. A clear picture.</p><span className={styles.inlineCapability}><Check size={14} aria-hidden="true" />Service and payment status, together</span></div><ServicePreview /></article>
              <article className={`${styles.darkRow} ${styles.darkRowReverse}`}><div className={styles.darkCopy}><span className={styles.featureEyebrow}>02 / MAKE THE EARNINGS CLEAR</span><h3>Good work.<br />Clear numbers.</h3><p>Connect eligible commissions and attendance-based daily pay. Review the details behind each payslip.</p><span className={styles.inlineCapability}><Check size={14} aria-hidden="true" />Daily pay, commissions, or both</span></div><EarningsPreview /></article>
            </div>
            <p className={styles.darkFootnote}>Illustrative product views with sample data. Payslips record earnings; transfers are handled separately.</p>
          </div>
        </section>

        <section className={`${styles.wrap} ${styles.growthSection}`} aria-labelledby="growth-heading">
          <div className={styles.centerIntro}><span className={styles.badge}><Sparkles size={13} aria-hidden="true" /> A little help with what’s next</span><h2 id="growth-heading">Run today.<br /><span>Make room for tomorrow.</span></h2><p>The daily work comes first. Thoughtful growth tools<br />help you bring the next visit a little closer.</p></div>
          <div className={styles.growthGrid}><GrowthPreview /><div className={styles.growthCopy}><span className={styles.featureEyebrow}>KEEP THE MOMENTUM GOING</span><h3>A quieter afternoon.<br />A new possibility.</h3><p>Find promotion ideas in gaps in your schedule. Create social content and keep customers in the conversation.</p><ul><li><Check size={16} aria-hidden="true" />Schedule-based growth opportunities</li><li><Check size={16} aria-hidden="true" />Social content for your business</li><li><Check size={16} aria-hidden="true" />Reminders and customer follow-ups</li></ul><p className={styles.planNote}>Availability depends on your plan and configured integrations.</p></div></div>
        </section>

        <section className={`${styles.wrap} ${styles.faqSection}`} id="questions" aria-labelledby="faq-heading"><div className={styles.centerIntro}><h2 id="faq-heading">A few good questions.</h2><p>Let’s make sure HANAYIN is right for you.</p></div><div className={styles.faqList}>{questions.map((item) => <details key={item.question}><summary>{item.question}<ChevronDown size={18} aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div></section>

        <section className={styles.closingSection} aria-labelledby="closing-heading"><div className={styles.closingDecoration} aria-hidden="true"><i /><i /><i /></div><div className={styles.centerIntro}><span className={styles.badge}><Sparkles size={13} aria-hidden="true" /> Your next good day starts here</span><h2 id="closing-heading">Less keeping up.<br /><span>More moving forward.</span></h2><p>Bring your bookings, your people,<br />and your business into order.</p><Link href="/apply" className={styles.button}>Let’s get started <ArrowRight size={16} aria-hidden="true" /></Link></div></section>
      </main>
      <footer className={`${styles.wrap} ${styles.footer}`}><div className={styles.footerTop}><Link href="/redesign" aria-label="HANAYIN home"><BrandMark /></Link><p>Your business, in order.</p><nav aria-label="Footer navigation"><a href="#product">Product</a><a href="#for-teams">For teams</a><a href="#questions">Questions</a><Link href="/login">Log in</Link></nav></div><svg className={styles.footerWordmark} viewBox="0 0 1100 240" aria-hidden="true" focusable="false"><text x="550" y="190" textAnchor="middle">HANAYIN</text></svg><div className={styles.footerBottom}><span>HANAYIN · A new identity for ServiceFlow.</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></div></footer>
    </div>
  );
}
