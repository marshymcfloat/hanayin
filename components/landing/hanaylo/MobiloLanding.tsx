import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BarChart3, CalendarDays, Check, CirclePlus, ClipboardList, Users, Wallet } from "lucide-react";
import HanayloHeader from "@/components/landing/hanaylo/HanayloHeader";
import RedesignSmoothScroll from "@/components/landing/hanaylo/RedesignSmoothScroll";
import HanayinLogo from "@/components/landing/hanaylo/HanayinLogo";
import HeroIntro from "@/components/landing/hanaylo/HeroIntro";
import BillingPeriodSelector from "@/components/landing/hanaylo/BillingPeriodSelector";
import ServiceShowcase from "@/components/landing/hanaylo/ServiceShowcase";
import GrowthTools from "@/components/landing/hanaylo/GrowthTools";
import FaqAccordion from "@/components/landing/hanaylo/FaqAccordion";
import faqStyles from "@/components/landing/hanaylo/faq.module.css";
import styles from "@/components/landing/hanaylo/mobilo.module.css";

function FeatureVisual({ src, alt, crop }: { src: string; alt: string; crop: "bookingsCrop" | "teamCrop" | "bookingCrop" }) {
  return <figure className={`${styles.featureVisual} ${styles[crop]}`}>
    <Image src={src} alt={alt} width={1536} height={1024} sizes="(max-width: 800px) 90vw, (max-width: 1440px) 50vw, 700px" />
  </figure>;
}

function Button({ href = "/apply", children = "Get started", black = false, arrow = false }: { href?: string; children?: ReactNode; black?: boolean; arrow?: boolean }) {
  return <Link href={href} className={`${styles.button} ${black ? styles.blackButton : ""}`}>{children}{arrow && <span className={styles.buttonArrow}><ArrowUpRight size={26} aria-hidden="true" /></span>}</Link>;
}

function Intro({ label, title, children, id }: { label: string; title: ReactNode; children?: ReactNode; id: string }) {
  return <div className={styles.intro}><span className={styles.badge}><CirclePlus size={14} aria-hidden="true" />{label}</span><h2 id={id}>{title}</h2>{children && <p>{children}</p>}</div>;
}

const plans = [
  { name: "Starter", monthlyPrice: 1299, line: "Bring the daily work into order.", features: ["Bookings and service records", "Staff roles and specialties", "Customer records and history", "Attendance and daily pay", "Service commissions and payslips", "Core business reports"] },
  { name: "Plus", monthlyPrice: 1999, line: "Connect your day with what comes next.", features: ["Everything in Starter", "Public booking website", "Growth opportunity insights", "Advanced business reports", "A clearer view of open slots", "Tools to support repeat visits"] },
  { name: "Pro", monthlyPrice: 2999, line: "Add support for your business’s growth.", features: ["Everything in Plus", "Social content tools", "AI-assisted captions", "AI-assisted promotional imagery", "Publishing with configured integrations", "Daily operations and growth together"] },
];

const questions = [
  { question: "What exactly is HANAYIN?", answer: "HANAYIN is business management for service teams. It connects bookings, staff-delivered services, payments, attendance, and staff earnings. It is the new identity being introduced for ServiceFlow." },
  { question: "Which businesses is HANAYIN built for?", answer: "Businesses where people deliver the service: salons, barbershops, spas, and service studios. The shared workflow matters more than the industry label." },
  { question: "Does every staff member need to work on commission?", answer: "No. You can use attendance-based daily pay, an employee-level commission percentage, or both. Commission eligibility requires a completed service and a fully paid booking." },
  { question: "Does HANAYIN transfer payroll or calculate taxes?", answer: "HANAYIN helps calculate earnings and prepare and record payslips. Money transfers, statutory deductions, and tax filing are handled separately." },
  { question: "How can I get started?", answer: "Submit your business details through Get started. Your setup is reviewed before access is provisioned. Your selected plan, billing period, and available integrations are reviewed during setup. Application and login pages currently use the ServiceFlow name." },
];

export default function MobiloLanding({ fontClassName }: { fontClassName: string }) {
  return <HeroIntro className={`${styles.page} ${fontClassName}`}>
    <RedesignSmoothScroll />
    <a href="#main" className={styles.skipLink}>Skip to content</a>
    <HanayloHeader appearance="reference" />
    <main id="main">
      <section className={styles.hero} aria-labelledby="hero-heading">
        <div className={styles.heroGrid} aria-hidden="true" />
        <Image data-hero-dryer className={`${styles.heroObject} ${styles.heroDryer}`} src="/hanaylo/hero-hair-dryer-v1.png" alt="" aria-hidden="true" width={1254} height={1254} sizes="(max-width: 1360px) 1px, 200px" loading="eager" />
        <Image data-hero-polish className={`${styles.heroObject} ${styles.heroPolish}`} src="/hanaylo/hero-nail-polish-v1.png" alt="" aria-hidden="true" width={1254} height={1254} sizes="(max-width: 1360px) 1px, 190px" loading="eager" />
        <div className={styles.heroCopy}>
          <div data-hero-copy className={styles.heroEyebrow}>Built for service teams</div>
          <h1 data-hero-copy id="hero-heading">Run your business in order with a smarter way to manage services.</h1>
          <p data-hero-copy>Organize your day with HANAYIN, connect your team, and keep track of the work that matters — from the first booking to the final payslip.</p>
          <div data-hero-copy className={styles.actions}><Button arrow /><Button href="#plans" black>Explore plans</Button></div>
        </div>
        <div className={styles.heroShowcase}>
          <Image data-hero-tools className={`${styles.heroObject} ${styles.heroTools}`} src="/hanaylo/hero-salon-tools-v1.webp" alt="" aria-hidden="true" width={1254} height={1254} sizes="(max-width: 1500px) 1px, 360px" loading="eager" />
          <figure data-hero-dashboard className={styles.heroFigure}>
            <div className={styles.heroMedia}>
              <Image className={styles.dashboard} unoptimized src="/hanaylo/hero-owner-dashboard-v2.png" alt="HANAYIN owner dashboard with fictional Luna Studio data: revenue, bookings, customers served, staff contributions, and the day's appointments." width={1600} height={1120} sizes="(max-width: 800px) 760px, (max-width: 1440px) 92vw, 1320px" loading="eager" />
            </div>
            <figcaption>Actual HANAYIN dashboard · Fictional business and sample data</figcaption>
          </figure>
          <Image data-hero-serum className={`${styles.heroObject} ${styles.heroSerum}`} src="/hanaylo/hero-serum-v1.png" alt="" aria-hidden="true" width={1254} height={1254} sizes="(max-width: 520px) 90px, (max-width: 800px) 125px, 155px" loading="eager" />
        </div>
      </section>

      <section className={styles.audience} aria-label="Businesses HANAYIN supports"><p>Different services. One connected way of working.</p><div className={styles.audienceNames}>{["Salons", "Barbershops", "Spas", "Beauty studios", "Wellness teams", "Service studios"].map(name => <span key={name}><span className={styles.logoBlank} aria-hidden="true" />{name}</span>)}</div></section>

      <section className={styles.section} aria-labelledby="values-heading">
        <div className={styles.wrap}><Intro label="Our foundation" id="values-heading" title={<>Your bookings. Your team.<br />Their earnings.</>}>Three connected parts of running a service business — from the next appointment to the next payslip.</Intro>
          <div className={styles.valuesGrid}>{[
            { icon: ClipboardList, title: "Every booking, in order", text: "Keep appointments, walk-ins, customer details, and service status together. Give every visit a clear place in your day.", image: "bookings" },
            { icon: Users, title: "Your team, connected", text: "Match services to staff specialties. Keep assignments and attendance in view, so everyone knows their part in the day.", image: "team" },
            { icon: Wallet, title: "Clear staff earnings", text: "Review attendance-based daily pay and eligible service commissions, with the details behind each payslip.", image: "earnings" },
          ].map(({ icon: Icon, title, text, image }) => <article className={styles.valueCard} key={title}><Icon className={styles.valueIcon} size={26} aria-hidden="true" /><h3>{title}</h3><p>{text}</p><div className={styles.valueImage}><Image src={`/hanaylo/foundation-${image}-v1.png`} alt="" aria-hidden="true" fill sizes="(max-width: 520px) calc(100vw - 80px), (max-width: 800px) calc(100vw - 128px), (max-width: 1440px) 30vw, 376px" className={styles.valueArtwork} /></div></article>)}</div>
        </div>
      </section>

      <section className={styles.section} id="product" aria-labelledby="features-heading"><div className={styles.wrap}>
        <Intro label="Key features" id="features-heading" title={<>Everything behind a service.<br />Connected in one place.</>}>Manage the booking, assign the right person, and follow the work through to payment — without losing the details in between.</Intro>
        <div className={styles.featureGrid}>
          <article className={`${styles.featureCard} ${styles.primaryFeature}`}>
            <div className={styles.featureCopy}><span className={styles.featureEyebrow}><CalendarDays size={16} aria-hidden="true" />The daily view</span><h3>A clear view of what’s next.</h3><p>Who’s coming in, what they booked, and where each visit stands. Your day, ready to run.</p></div>
            <FeatureVisual src="/hanaylo/product-bookings.png" crop="bookingsCrop" alt="Sample bookings for Alex Reyes at 10:00 AM, Sam Dela Cruz at 11:00 AM, and Jamie Lim at 1:30 PM, with confirmed, in-service, and pending statuses." />
          </article>
          <article className={`${styles.featureCard} ${styles.teamFeature}`}>
            <div className={styles.featureCopy}><span className={styles.featureEyebrow}><Users size={16} aria-hidden="true" />Your people</span><h3>The right person for the service.</h3><p>Roles, specialties, and regular days off, all in view.</p></div>
            <FeatureVisual src="/hanaylo/product-team.png" crop="teamCrop" alt="Sample team directory showing Mira Reyes and Jules Santos as staff and Andrea Lim as manager, with service specialties and regular days off." />
          </article>
          <article className={`${styles.featureCard} ${styles.paymentFeature}`}>
            <div className={styles.featureCopy}><span className={styles.featureEyebrow}><Wallet size={16} aria-hidden="true" />The visit details</span><h3>Booked doesn’t mean paid.</h3><p>Keep the service, assigned staff, and payment record connected — with each status clear.</p></div>
            <FeatureVisual src="/hanaylo/product-booking-details.png" crop="bookingCrop" alt="Sample confirmed booking for Alex Reyes: Cut and style with Mira Reyes, 45 minutes, ₱600 total, ₱200 expected deposit, and payment not recorded." />
          </article>
        </div>
        <p className={styles.visualDisclosure}>Product illustrations based on our interface. Names and records are fictional.</p>
      </div></section>

      <section className={styles.section} id="details" aria-labelledby="details-heading"><div className={styles.wrap}>
        <Intro label="A closer look" id="details-heading" title={<>The business numbers.<br />The people behind them.</>}>Review business performance and connect your team’s attendance and eligible service commissions to their payslips.</Intro>
        <div className={styles.detailRows}>
          <article className={styles.detailRow} aria-labelledby="performance-heading">
            <div className={styles.detailCopy}><span className={styles.featureEyebrow}><BarChart3 size={16} aria-hidden="true" />Business performance</span><h3 id="performance-heading">See what comes in.<br />And what goes out.</h3><p>Compare recorded service revenue and business expenses over time. See the difference, spot changes, and keep the numbers close when making decisions.</p><ul className={styles.detailFacts}><li><Check size={16} aria-hidden="true" />Revenue, expenses, and cashflow in one chart</li><li><Check size={16} aria-hidden="true" />Views for 7 days, a month, 6 months, or a year</li></ul></div>
            <figure className={`${styles.detailArtwork} ${styles.performanceArtwork}`}><div className={styles.performanceCrop}><Image src="/hanaylo/product-dashboard-hanayin.png" alt="Sample Financial pulse chart comparing recorded revenue, expenses, and cashflow across four weeks, with the Month period selected." width={1586} height={992} sizes="(max-width: 800px) 155vw, (max-width: 1440px) 85vw, 1100px" /></div><figcaption>Financial pulse · Illustrative sample data</figcaption></figure>
          </article>
          <article className={styles.detailRow} aria-labelledby="earnings-heading">
            <div className={styles.detailCopy}><span className={styles.featureEyebrow}><Wallet size={16} aria-hidden="true" />Staff earnings</span><h3 id="earnings-heading">Know what goes into<br />each payslip.</h3><p>Keep daily rates, commission percentages, and recorded paid payslips in one view. Prepare staff earnings from the work and attendance recorded in HANAYIN.</p><ul className={styles.detailFacts}><li><Check size={16} aria-hidden="true" />Daily pay for present days and paid leave</li><li><Check size={16} aria-hidden="true" />Eligible commissions from completed services on fully paid bookings</li><li><Check size={16} aria-hidden="true" />Paid payslip history for each employee</li></ul></div>
            <figure className={`${styles.detailArtwork} ${styles.payrollArtwork}`}><Image src="/hanaylo/product-payroll.png" alt="Sample payroll workspace with employee daily rates, commission percentages, and three recorded paid payslips totaling ₱10,450. Mira Reyes has a ₱500 daily rate, 20% commission rate, and ₱2,620 last paid." width={1536} height={1024} sizes="(max-width: 800px) 95vw, (max-width: 1440px) 50vw, 660px" /><figcaption>Pay settings &amp; paid payslips · Fictional records</figcaption></figure>
          </article>
        </div>
      </div></section>

      <section className={styles.section} id="plans" aria-labelledby="plans-heading"><div className={styles.wrap}>
        <Intro label="Find your fit" id="plans-heading" title={<>Plans for the work you do.<br />Room for what comes next.</>}>Start with daily operations, then add a booking website, growth insights, and social tools as your business needs them.</Intro>
        <BillingPeriodSelector plans={plans} />
        <div className={styles.planBanner}><div><h3>A setup that fits your team</h3><p>Tell us how your business works. We’ll review your needs, help you choose a plan, and confirm available integrations during setup.</p><Button black>Get started</Button></div><div className={styles.bannerImage}><Image src="/hanaylo/setup-team-v1.png" alt="" aria-hidden="true" fill sizes="(max-width: 520px) 85vw, (max-width: 800px) 40vw, 480px" /></div></div>
      </div></section>

      <section className={`${styles.section} ${styles.teamSection}`} id="for-teams" aria-labelledby="teams-heading">
        <Intro label="Made for your team" id="teams-heading" title={<>Many kinds of service.<br />One connected workday.</>}>Your people bring the expertise. HANAYIN brings bookings, service work, and staff earnings together — whatever your team’s specialty.</Intro>
        <ServiceShowcase />
      </section>

      <section className={styles.section} id="growth" aria-labelledby="growth-heading"><div className={styles.wrap}>
        <Intro label="Room to grow" id="growth-heading" title={<>Keep today running.<br />Make room for tomorrow.</>}>Spot an opportunity, shape your next promotion, and keep an eye on the numbers. Support for what comes after the day-to-day.</Intro>
        <GrowthTools />
      </div></section>

      <section className={`${styles.section} ${faqStyles.section}`} id="questions" aria-labelledby="faq-heading"><div className={`${styles.wrap} ${faqStyles.layout}`}>
        <div className={faqStyles.intro}><span className={styles.badge}><CirclePlus size={14} aria-hidden="true" />FAQs</span><h2 id="faq-heading">Good questions.<br />Clear answers.</h2><p>A few things to know about your team, their earnings, and getting started with HANAYIN.</p><div className={faqStyles.help}><p>Have something else in mind?</p><Link href="/apply">Talk about your setup<ArrowUpRight size={17} aria-hidden="true" /></Link></div></div>
        <FaqAccordion questions={questions} />
      </div></section>

      <section className={`${styles.section} ${styles.ctaSection}`} id="contact" aria-labelledby="cta-heading"><div className={`${styles.wrap} ${styles.ctaPanel}`}>
        <div className={styles.ctaArtwork} aria-hidden="true">
          <Image className={styles.ctaDryer} src="/hanaylo/hero-hair-dryer-v1.png" alt="" width={1254} height={1254} sizes="(max-width: 520px) 120px, (max-width: 1240px) 150px, 250px" />
          <Image className={styles.ctaPolish} src="/hanaylo/hero-nail-polish-v1.png" alt="" width={1254} height={1254} sizes="(max-width: 520px) 110px, (max-width: 1240px) 140px, 230px" />
          <Image className={styles.ctaSerum} src="/hanaylo/hero-serum-v1.png" alt="" width={1254} height={1254} sizes="220px" />
        </div>
        <h2 id="cta-heading">Bring your business into order.<br /> Keep your people connected.</h2><p>Bookings, services, payments, and staff earnings. Give your team one place to bring the day together.</p><div className={styles.actions}><Button black>Get started</Button><Button href="/login" black>Log in</Button></div>
      </div></section>
    </main>
    <footer className={styles.footer}><svg className={styles.footerWatermark} viewBox="0 0 1800 400" aria-hidden="true" focusable="false"><text x="900" y="310" textAnchor="middle">HANAYIN</text></svg><div className={styles.wrap}><div className={styles.footerTop}><div><Link href="/redesign" className={styles.footerLogoLink} aria-label="HANAYIN home"><HanayinLogo footer /></Link><p>A clearer way to run a business where people deliver the service. Keep your bookings, your team, and their earnings connected.</p></div><div className={styles.footerInvite}><h3>Bring your business into order</h3><p>Tell us about your team and how your day works.</p><Link href="/apply">Start your application <ArrowUpRight size={22} aria-hidden="true" /></Link></div></div><div className={styles.footerBottom}><nav aria-label="Footer navigation"><a href="#top">Home</a><a href="#product">Features</a><a href="#plans">Plans</a><a href="#questions">Questions</a></nav><nav aria-label="Legal navigation"><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms of service</Link><Link href="/login">Log in</Link></nav></div><div className={styles.copyright}><span>HANAYIN · A new identity for ServiceFlow.</span><span>Your business, in order.</span></div></div></footer>
  </HeroIntro>;
}
