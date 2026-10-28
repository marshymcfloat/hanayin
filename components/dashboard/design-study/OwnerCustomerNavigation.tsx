import Link from "next/link";
import { Bell, CalendarDays, ContactRound, Inbox } from "lucide-react";
import styles from "@/components/dashboard/design-study/owner-business-navigation.module.css";

export type OwnerCustomerPage = "customers" | "bookings" | "inbox" | "notifications";
export const ownerCustomerPageLabels: Record<OwnerCustomerPage, string> = { customers: "Customers", bookings: "Bookings", inbox: "Customer inbox", notifications: "Notifications" };
export const ownerCustomerPages = [
  { page: "customers", enabled: true, icon: ContactRound },
  { page: "bookings", enabled: true, icon: CalendarDays },
  { page: "inbox", enabled: true, icon: Inbox },
  { page: "notifications", enabled: true, icon: Bell },
] satisfies Array<{ page: OwnerCustomerPage; enabled: boolean; icon: typeof ContactRound }>;
export function isOwnerCustomerPage(page: string): page is OwnerCustomerPage { return Object.hasOwn(ownerCustomerPageLabels, page); }
export function ownerCustomerHref(page: OwnerCustomerPage) { return `/redesign/owner-dashboard/customers${page === "customers" ? "" : `/${page}`}`; }

export default function OwnerCustomerNavigation({ activePage }: { activePage: OwnerCustomerPage }) {
  return <nav className={styles.navigation} aria-label="Customers sections">
    <h2 className={styles.heading}><span><ContactRound size={16} aria-hidden="true" /></span>Customers</h2>
    <ul className={styles.items}>{ownerCustomerPages.map(({ page, enabled, icon: Icon }) => <li key={page}>{enabled
      ? <Link href={ownerCustomerHref(page)} aria-current={activePage === page ? "page" : undefined}><Icon size={16} aria-hidden="true" />{ownerCustomerPageLabels[page]}</Link>
      : <button type="button" disabled aria-describedby="customers-navigation-note"><Icon size={16} aria-hidden="true" />{ownerCustomerPageLabels[page]}</button>}</li>)}</ul>
    {ownerCustomerPages.some(item => !item.enabled) && <p id="customers-navigation-note" className={styles.note}>More customer pages coming soon.</p>}
  </nav>;
}
