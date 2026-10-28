import Link from "next/link";
import { CalendarCheck, ShieldCheck, Users, Wallet } from "lucide-react";
import styles from "@/components/dashboard/design-study/owner-business-navigation.module.css";

export type OwnerTeamPage = "employees" | "owners" | "attendance" | "payroll";
export const ownerTeamPageLabels: Record<OwnerTeamPage, string> = { employees: "People", owners: "Owners", attendance: "Time & Leave", payroll: "Payroll" };
// Enable each destination only when its route and verification are implemented.
export const ownerTeamPages: ReadonlyArray<{ page: OwnerTeamPage; enabled: boolean; icon: typeof Users }> = [
  { page: "employees", enabled: true, icon: Users },
  { page: "owners", enabled: true, icon: ShieldCheck },
  { page: "attendance", enabled: true, icon: CalendarCheck },
  { page: "payroll", enabled: true, icon: Wallet },
];
export function isOwnerTeamPage(page: string): page is OwnerTeamPage { return Object.hasOwn(ownerTeamPageLabels, page); }

export default function OwnerTeamNavigation({ activePage }: { activePage: OwnerTeamPage }) {
  return <nav className={styles.navigation} aria-label="Team sections">
    <h2 className={styles.heading}><span><Users size={16} aria-hidden="true" /></span>Team</h2>
    <ul className={styles.items}>{ownerTeamPages.map(({ page, enabled, icon: Icon }) => <li key={page}>{enabled
      ? <Link href={`/redesign/owner-dashboard/team/${page}`} aria-current={activePage === page ? "page" : undefined}><Icon size={16} aria-hidden="true" />{ownerTeamPageLabels[page]}</Link>
      : <button type="button" disabled aria-describedby="team-navigation-note"><Icon size={16} aria-hidden="true" />{ownerTeamPageLabels[page]}</button>}</li>)}</ul>
    {ownerTeamPages.some(page => !page.enabled) && <p id="team-navigation-note" className={styles.note}>More team pages coming soon.</p>}
  </nav>;
}
