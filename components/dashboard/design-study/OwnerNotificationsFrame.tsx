import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "@/components/dashboard/design-study/owner-services.module.css";

export function OwnerNotificationsFrame({ children, refreshControl }: { children: ReactNode; refreshControl?: ReactNode }) {
  return <div className={styles.page}><div className={styles.content}>
    <Link href="/redesign/owner-dashboard/customers" className={styles.back}><ArrowLeft size={14} aria-hidden="true" />Customers</Link>
    <header className={styles.header}><div><p className={styles.eyebrow}>Communication history</p><h1>Notifications</h1><p className={styles.description}>Recorded SMS and email delivery for customers and staff. This history is read-only.</p></div><div className={styles.refresh}>{refreshControl}</div></header>
    {children}
  </div></div>;
}
