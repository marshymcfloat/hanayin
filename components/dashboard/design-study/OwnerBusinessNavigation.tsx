import Link from "next/link";
import { BarChart3, Box, CalendarDays, CreditCard, Gift, Megaphone, Package, Percent, Ticket, TrendingUp } from "lucide-react";
import styles from "@/components/dashboard/design-study/owner-business-navigation.module.css";

const upcoming = [
  { label: "Growth", icon: TrendingUp },
];

export type OwnerBusinessPage = "services" | "packages" | "vouchers" | "gift-cards" | "sale-events" | "social-posts" | "business-hours" | "billing" | "reports";
export const ownerBusinessPageLabels: Record<OwnerBusinessPage, string> = { services: "Services", packages: "Packages", vouchers: "Vouchers", "gift-cards": "Gift cards", "sale-events": "Sale events", "social-posts": "Social posts", "business-hours": "Business hours", billing: "Billing", reports: "Reports" };

export default function OwnerBusinessNavigation({ activePage = "services" }: { activePage?: OwnerBusinessPage }) {
  return <nav className={styles.navigation} aria-label="Business sections">
    <h2 className={styles.heading}><span><Box size={16} aria-hidden="true" /></span>Business</h2>
    <ul className={styles.items}>
      <li><Link href="/redesign/owner-dashboard/business/services" aria-current={activePage === "services" ? "page" : undefined}><Box size={16} aria-hidden="true" />Services</Link></li>
      <li><Link href="/redesign/owner-dashboard/business/packages" aria-current={activePage === "packages" ? "page" : undefined}><Package size={16} aria-hidden="true" />Packages</Link></li>
      <li><Link href="/redesign/owner-dashboard/business/vouchers" aria-current={activePage === "vouchers" ? "page" : undefined}><Ticket size={16} aria-hidden="true" />Vouchers</Link></li>
      <li><Link href="/redesign/owner-dashboard/business/gift-cards" aria-current={activePage === "gift-cards" ? "page" : undefined}><Gift size={16} aria-hidden="true" />Gift Cards</Link></li>
      <li><Link href="/redesign/owner-dashboard/business/sale-events" aria-current={activePage === "sale-events" ? "page" : undefined}><Percent size={16} aria-hidden="true" />Sale Events</Link></li>
      <li><Link href="/redesign/owner-dashboard/business/social-posts" aria-current={activePage === "social-posts" ? "page" : undefined}><Megaphone size={16} aria-hidden="true" />Social Posts</Link></li>
      {upcoming.map(({ label, icon: Icon }) => <li key={label}><button type="button" disabled aria-describedby="business-navigation-note"><Icon size={16} aria-hidden="true" />{label}</button></li>)}
      <li><Link href="/redesign/owner-dashboard/business/business-hours" aria-current={activePage === "business-hours" ? "page" : undefined}><CalendarDays size={16} aria-hidden="true" />Business Hours</Link></li>
      <li><Link href="/redesign/owner-dashboard/business/billing" aria-current={activePage === "billing" ? "page" : undefined}><CreditCard size={16} aria-hidden="true" />Billing</Link></li>
      <li><Link href="/redesign/owner-dashboard/business/reports" aria-current={activePage === "reports" ? "page" : undefined}><BarChart3 size={16} aria-hidden="true" />Reports</Link></li>
    </ul>
    <p id="business-navigation-note" className={styles.note}>More business pages coming soon.</p>
  </nav>;
}
