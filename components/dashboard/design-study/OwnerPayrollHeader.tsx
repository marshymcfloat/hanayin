import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "@/components/dashboard/design-study/owner-services.module.css";
import payroll from "@/components/dashboard/design-study/owner-payroll.module.css";

export function OwnerPayrollHeader({ actions, onBack, description = "Their work, their earnings. Keep pay clear and your team in the loop." }: { actions?: ReactNode; onBack?: () => void; description?: string }) {
  return <>
    {onBack ? <button type="button" className={`${styles.back} ${payroll.returnLink}`} onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />Back to simple payroll</button> : <Link className={styles.back} href="/redesign/owner-dashboard"><ArrowLeft size={15} aria-hidden="true" />Dashboard</Link>}
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Your team</p><h1>Payroll<span className={styles.titleDetail} aria-hidden="true">, clearly accounted for.</span></h1><p className={styles.description}>{description}</p></div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  </>;
}
