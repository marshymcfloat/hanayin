import Image from "next/image";
import { Maximize2 } from "lucide-react";
import styles from "@/components/landing/hanaylo/hanaylo.module.css";

const visuals = {
  dashboard: { src: "/hanaylo/product-dashboard-hanayin.png", width: 1586, height: 992, alt: "Illustrative HANAYIN owner dashboard with revenue, expenses, net income, booking completion, financial chart, and today's bookings." },
  bookings: { src: "/hanaylo/product-bookings.png", width: 1536, height: 1024, alt: "Illustrative today's bookings list showing customer names, services, appointment times, and confirmed, in-service, or pending status." },
  team: { src: "/hanaylo/product-team.png", width: 1536, height: 1024, alt: "Illustrative employee directory with role filters, staff specialties, and regular days off." },
  service: { src: "/hanaylo/product-booking-details.png", width: 1536, height: 1024, alt: "Illustrative booking details for Alex Reyes: Cut and style with Mira Reyes, 45 minutes, 600 peso booking total, 200 peso expected deposit, and payment not recorded." },
  payroll: { src: "/hanaylo/product-payroll.png", width: 1536, height: 1024, alt: "Illustrative payroll workspace with daily rates, commission percentages, last paid amounts, and recorded paid payslips." },
  growth: { src: "/hanaylo/product-growth-refined.png", width: 1536, height: 1024, alt: "Illustrative growth opportunity with a quieter afternoon suggestion, time window, confidence, recommended percentage discount, and create-offer action." },
} as const;

function ProductImage({ kind, className, preload = false }: { kind: keyof typeof visuals; className: string; preload?: boolean }) {
  const visual = visuals[kind];
  return <figure className={className}><a href={visual.src} target="_blank" rel="noreferrer" className={styles.productImageLink} aria-label={`View full-size ${kind} product illustration`}><Image {...visual} alt={visual.alt} sizes={kind === "dashboard" ? "(max-width: 1400px) 95vw, 1280px" : "(max-width: 620px) 95vw, (max-width: 1400px) 50vw, 700px"} className={styles.productBitmap} preload={preload} /><span className={styles.imageExpand} aria-hidden="true"><Maximize2 size={15} /></span></a></figure>;
}

export function DashboardPreview() { return <ProductImage kind="dashboard" className={styles.dashboardPreview} preload />; }
export function SchedulePreview() { return <ProductImage kind="bookings" className={styles.schedulePreview} />; }
export function TeamPreview() { return <ProductImage kind="team" className={styles.teamPreview} />; }
export function ServicePreview() { return <ProductImage kind="service" className={styles.servicePreview} />; }
export function EarningsPreview() { return <ProductImage kind="payroll" className={styles.earningsPreview} />; }
export function GrowthPreview() { return <ProductImage kind="growth" className={styles.growthPreview} />; }
